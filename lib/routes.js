/**
 * 宿主 HTTP 端点，服务浏览器半边。
 *
 * 注册进官方 `/api` 通道的精确 Fetch 路由表（`ctx.connection.fetch.register`）：
 * Host/Origin 校验与浏览器会话鉴权由宿主的 `/api` 前缀处理器先跑完，才轮到我们，
 * 所以这里不再自己判 Host，也不接受未鉴权的请求。
 */

import { createSkill, deleteSkill, importDirectory, importSkill, importZip, readSkill, readSkillBody, saveSkill, updateSkillMeta } from './operations.js'
import { DEFAULT_CATEGORIES, classifyByStage, proposeCategories } from './classify.js'
import { classifyWithModel } from './classify-ai.js'
import { describeSkill } from './describe.js'
import { readSkillFile } from './catalog.js'
import { contentHash, dropSuggestion, loadSuggestions, putSuggestion } from './suggestions.js'
import { repoRoot } from './roots.js'
import { readFileSync } from 'node:fs'

/** 所有端点的共同前缀。 */
export const ROUTE_PREFIX = '/api/dsh-skill-manager'

const ENDPOINTS = [
  { path: '/catalog', methods: ['GET'] },
  { path: '/registry', methods: ['GET'] },
  { path: '/preferences', methods: ['POST'] },
  { path: '/classify', methods: ['POST'] },
  { path: '/skill', methods: ['GET'] },
  { path: '/skill/create', methods: ['POST'] },
  { path: '/skill/save', methods: ['POST'] },
  { path: '/skill/meta', methods: ['POST'] },
  { path: '/skill/suggestion', methods: ['POST'] },
  { path: '/skill/delete', methods: ['POST'] },
  { path: '/skill/import', methods: ['POST'] },
  { path: '/skill/import-dir', methods: ['POST'] },
  { path: '/skill/import-zip', methods: ['POST'] },
  { path: '/skill/describe', methods: ['POST'] },
  { path: '/pick-directory', methods: ['POST'] },
  { path: '/open', methods: ['POST'] },
]

const MAX_BODY_BYTES = 8 << 20

/**
 * 返回 JSON 响应。
 * @param {unknown} payload - 响应体
 * @param {number} [status] - 状态码
 * @returns {Response} 响应
 */
function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

/**
 * 把端点挂到官方通道上。
 * @param {{ get: (name: string) => any }} ctx - 上下文查表
 * @param {object} connection - connection 服务
 * @param {object} runtime - 运行时
 * @returns {() => void} 注销函数
 */
export function installRoutes(ctx, connection, runtime) {
  if (!connection || typeof connection.fetch?.register !== 'function') {
    throw new Error('connection 服务缺少 fetch.register，无法注册 /api 端点')
  }
  const disposers = ENDPOINTS.map((endpoint) =>
    connection.fetch.register({
      path: `${ROUTE_PREFIX}${endpoint.path}`,
      methods: endpoint.methods,
      requestBody: 'buffered',
      fetch: (request) => handle(request, runtime, ctx),
    }),
  )
  runtime.log('routes-mounted', `已在 ${ROUTE_PREFIX} 下注册 ${ENDPOINTS.length} 条 /api 精确路由`)
  return () => {
    for (const dispose of disposers) if (typeof dispose === 'function') dispose()
  }
}

/**
 * 处理一个请求。
 * @param {Request} request - 请求
 * @param {object} runtime - 运行时
 * @param {{ get: (name: string) => any }} ctx - 上下文查表
 * @returns {Promise<Response>} 响应
 */
async function handle(request, runtime, ctx) {
  const url = new URL(request.url)
  const path = url.pathname.slice(ROUTE_PREFIX.length)
  const cwd = url.searchParams.get('cwd') || undefined
  try {
    switch (path) {
      case '/catalog':
        return json(catalogPayload(runtime, cwd))
      case '/registry':
        return json(await registryPayload(ctx, cwd))
      case '/preferences': {
        const body = await readBody(request)
        if (!body) return json({ ok: false, error: '请求体不是合法 JSON' }, 400)
        runtime.savePreferences(body.preferences ?? body)
        runtime.invalidate()
        return json({ ok: true, preferences: runtime.preferences() })
      }
      case '/classify': {
        const body = (await readBody(request)) ?? {}
        const catalog = runtime.catalog(cwd)
        const withBody = catalog.skills.map((skill) => ({ ...skill, body: readSkillBody(skill.path) }))
        const preferences = runtime.preferences()
        const manual = preferences.categories.filter((category) => category.auto !== true)
        const taken = new Set(manual.flatMap((category) => category.skills))
        const pending = withBody.filter((skill) => !taken.has(skill.name))

        // 默认走模型：按产品/项目阶段理解后分组；模型不可用才退回关键词规则。
        if (body.mode !== 'heuristic' && pending.length > 0) {
          try {
            const ai = await classifyWithModel({
              llm: ctx.get('llm'),
              route: { provider: runtime.settings.provider, model: runtime.settings.model },
              skills: pending,
            })
            if (ai.ok) {
              return json({ ok: true, source: 'llm', categories: mergeCategories(manual, ai.categories, pending), assignments: [], created: ai.categories.map((category) => category.id) })
            }
            // 模型不可用时退回「阶段关键词表」，仍然是按阶段，而不是按字面词聚类。
            const fallback = classifyByStage(pending)
            return json({
              ok: true,
              source: 'heuristic',
              warning: ai.error,
              categories: mergeCategories(manual, fallback.categories, []),
              assignments: [],
              created: fallback.categories.map((category) => category.id),
            })
          } catch (error) {
            const fallback = classifyByStage(pending)
            return json({
              ok: true,
              source: 'heuristic',
              warning: error instanceof Error ? error.message : String(error),
              categories: mergeCategories(manual, fallback.categories, []),
              assignments: [],
              created: fallback.categories.map((category) => category.id),
            })
          }
        }

        const provided = Array.isArray(body.categories) ? body.categories : []
        const base = provided.length > 0 ? provided : body.autoCreate === false ? DEFAULT_CATEGORIES : []
        const result = proposeCategories(withBody, base, { allowCreate: body.autoCreate !== false })
        return json({ ok: true, source: 'heuristic', suggestions: result.assignments, categories: result.categories, created: result.created })
      }
      case '/skill/describe': {
        const body = (await readBody(request)) ?? {}
        const root = findRoot(runtime, cwd, body.rootKey)
        const file = root ? readSkillFile(root.path, body.name) : undefined
        if (!file) return json({ ok: false, error: `找不到技能 ${body.name ?? ''}` }, 400)
        const lang = body.lang === 'en' ? 'en' : 'zh'
        const result = await describeSkill({
          llm: ctx.get('llm'),
          route: { provider: runtime.settings.provider, model: runtime.settings.model },
          skill: {
            name: body.name,
            description: String(file.parsed.attributes.description ?? ''),
            whenToUse: String(file.parsed.attributes['when-to-use'] ?? ''),
            body: file.parsed.body,
          },
          lang,
        })
        // 建议只落在旁路文件里，绝不改写 SKILL.md。
        putSuggestion(runtime.settings.dshHome, {
          name: body.name,
          hash: contentHash(file.source),
          description: result.description,
          whenToUse: result.whenToUse,
          category: result.category,
          source: result.source,
          lang,
          error: result.error,
        })
        return json({ ...result, lang })
      }
      case '/skill/suggestion': {
        const body = (await readBody(request)) ?? {}
        dropSuggestion(runtime.settings.dshHome, body.name)
        runtime.invalidate()
        return json({ ok: true })
      }
      case '/skill': {
        const root = findRoot(runtime, cwd, url.searchParams.get('rootKey'))
        const result = readSkill({ root, name: url.searchParams.get('name') ?? '' })
        return json(result, result.ok ? 200 : 400)
      }
      case '/skill/create':
        return mutation(runtime, cwd, await readBody(request), createSkill)
      case '/skill/save':
        return mutation(runtime, cwd, await readBody(request), saveSkill)
      case '/skill/meta':
        return mutation(runtime, cwd, await readBody(request), updateSkillMeta)
      case '/skill/delete':
        return mutation(runtime, cwd, await readBody(request), deleteSkill)
      case '/skill/import':
        return mutation(runtime, cwd, await readBody(request), importSkill)
      case '/skill/import-dir':
        return mutation(runtime, cwd, await readBody(request), importDirectory)
      case '/skill/import-zip':
        return mutation(runtime, cwd, await readBody(request), importZip)
      case '/pick-directory':
        return json(await pickDirectory(ctx))
      case '/open': {
        const root = findRoot(runtime, cwd, url.searchParams.get('rootKey') ?? undefined)
        return json(await openFolder(root))
      }
      default:
        return json({ ok: false, error: `未知端点 ${path}` }, 404)
    }
  } catch (error) {
    runtime.log('request-failed', `${path}: ${error instanceof Error ? error.message : String(error)}`)
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
}

/**
 * 读 JSON 请求体，带大小上限。
 * @param {Request} request - 请求
 * @returns {Promise<any>} 请求体
 */
async function readBody(request) {
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new Error('请求体过大')
  if (!text.trim()) return {}
  return JSON.parse(text)
}

/**
 * 执行一次写操作并刷新缓存。
 * @param {object} runtime - 运行时
 * @param {string|undefined} cwd - 工作目录
 * @param {any} body - 请求体
 * @param {Function} operation - 操作函数
 * @returns {Response} 响应
 */
function mutation(runtime, cwd, body, operation) {
  const root = findRoot(runtime, cwd, body?.rootKey)
  const result = operation({ ...body, root })
  if (result.ok) {
    runtime.invalidate()
    runtime.log('mutation', `${operation.name} ${body?.name ?? body?.text?.slice(0, 30) ?? ''}`)
  }
  return json(result, result.ok ? 200 : 400)
}

/**
 * 按 key 查根，外部字符串一律查表，不拼路径。
 * @param {object} runtime - 运行时
 * @param {string|undefined} cwd - 工作目录
 * @param {string|undefined} key - 根 key
 * @returns {object|undefined} 根
 */
function findRoot(runtime, cwd, key) {
  const roots = runtime.rootsFor(cwd)
  if (!key) return roots.find((root) => !root.readOnly)
  return roots.find((root) => root.key === key)
}

/**
 * 合并模型给的分类：手工分类原样保留，模型分类按名字并入，剩下的进「其他」。
 * @param {Array<object>} manual - 手工分类
 * @param {Array<object>} aiCategories - 模型给的分类
 * @param {Array<{ name: string }>} pending - 参与归类的技能
 * @returns {Array<object>} 合并后的分类
 */
function mergeCategories(manual, aiCategories, pending = []) {
  const result = manual.map((category) => ({ ...category, skills: [...category.skills] }))
  for (const ai of aiCategories) {
    const existing = result.find((category) => category.name === ai.name)
    if (existing) existing.skills = [...new Set([...existing.skills, ...ai.skills])]
    else result.push({ id: ai.id, name: ai.name, keywords: [], skills: [...ai.skills], auto: true })
  }
  const assigned = new Set(result.flatMap((category) => category.skills))
  const leftovers = pending.map((skill) => skill.name).filter((name) => !assigned.has(name))
  if (leftovers.length > 0) {
    const other = result.find((category) => category.name === '其他')
    if (other) other.skills = [...new Set([...other.skills, ...leftovers])]
    else result.push({ id: 'other', name: '其他', keywords: [], skills: leftovers, auto: true })
  }
  return result
}

/**
 * 读一个技能的 SKILL.md 全文。
 * @param {string} path - 文件路径
 * @returns {string} 内容；读不到为空串
 */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * 目录清单 + 偏好 + 分类归属。
 * @param {object} runtime - 运行时
 * @param {string|undefined} cwd - 工作目录
 * @returns {object} 负载
 */
function catalogPayload(runtime, cwd) {
  const roots = runtime.rootsFor(cwd)
  const catalog = runtime.catalog(cwd)
  const preferences = runtime.preferences()
  const categoryOf = new Map()
  for (const category of preferences.categories) {
    for (const name of category.skills) {
      categoryOf.set(name, [...(categoryOf.get(name) ?? []), category.id])
    }
  }
  const disabled = new Set(preferences.disabled)
  const defaultLoaded = new Set(preferences.defaultLoaded)
  const suggestions = loadSuggestions(runtime.settings.dshHome).entries
  return {
    ok: true,
    cwd: cwd ?? runtime.defaultCwd,
    projectRoot: repoRoot(cwd ?? runtime.defaultCwd),
    roots: roots.map(({ key, source, rank, path, readOnly }) => ({ key, source, rank, path, readOnly: readOnly === true })),
    skillRoot: roots.find((root) => !root.readOnly)?.path,
    preferences,
    preferencesPath: runtime.preferencesPath,
    skills: catalog.skills.map((skill) => {
      // 只有内容没变过的建议才展示，防止改了文件还挂着旧建议。
      const stored = suggestions[skill.name]
      const fresh = stored && stored.hash === contentHash(readText(skill.path))
      return {
        ...skill,
        enabled: !disabled.has(skill.name),
        defaultLoaded: defaultLoaded.has(skill.name),
        categoryIds: categoryOf.get(skill.name) ?? [],
        aiSuggestion: fresh
          ? {
              description: stored.description,
              whenToUse: stored.whenToUse,
              category: stored.category,
              source: stored.source,
              lang: stored.lang,
              at: stored.at,
              error: stored.error,
            }
          : undefined,
      }
    }),
    shadowed: catalog.shadowed,
  }
}

/**
 * 真实注册表快照，用来核对界面与模型看到的是不是同一份。
 * @param {{ get: (name: string) => any }} ctx - 上下文查表
 * @param {string|undefined} cwd - 工作目录
 * @returns {Promise<object>} 负载
 */
async function registryPayload(ctx, cwd) {
  const skills = ctx.get('skills')
  if (!skills || typeof skills.snapshot !== 'function') return { ok: false, error: '技能注册表不可用' }
  const snapshot = await skills.snapshot(cwd ? { cwd } : {})
  return {
    ok: true,
    complete: snapshot.complete,
    skills: snapshot.skills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      source: skill.source,
      provider: skill.provider,
      modelInvocable: skill.invocation.modelInvocable,
      userInvocable: skill.invocation.userInvocable,
    })),
  }
}

/**
 * 打开宿主原生目录选择器（若该后端支持）。
 * @param {{ get: (name: string) => any }} ctx - 上下文查表
 * @returns {Promise<{ ok: boolean, kind: string, path?: string | null, error?: string }>} 结果
 */
async function pickDirectory(ctx) {
  const picker = ctx.get('directoryPicker')
  if (!picker || typeof picker.capability !== 'function') {
    return { ok: false, kind: 'none', error: '宿主没有提供目录选择器，请手动填写绝对路径' }
  }
  let capability
  try {
    capability = picker.capability()
  } catch (error) {
    return { ok: false, kind: 'none', error: error instanceof Error ? error.message : String(error) }
  }
  if (!capability || capability.kind !== 'native' || typeof capability.pick !== 'function') {
    return { ok: false, kind: String(capability?.kind ?? 'unknown'), error: '当前宿主形态不支持原生目录选择，请手动填写绝对路径' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
    const path = await capability.pick(controller.signal)
    return { ok: true, kind: 'native', path }
  } catch (error) {
    return { ok: false, kind: 'native', error: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 在宿主文件管理器里打开目录。
 * @param {object|undefined} root - 根
 * @returns {Promise<{ ok: boolean, opened: boolean, path?: string, error?: string }>} 结果
 */
async function openFolder(root) {
  if (!root) return { ok: false, opened: false, error: '未知的技能根目录' }
  try {
    const { spawn } = await import('node:child_process')
    const command = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open'
    spawn(command, [root.path], { detached: true, stdio: 'ignore' }).unref()
    return { ok: true, opened: true, path: root.path }
  } catch (error) {
    return { ok: true, opened: false, path: root.path, error: error instanceof Error ? error.message : String(error) }
  }
}
