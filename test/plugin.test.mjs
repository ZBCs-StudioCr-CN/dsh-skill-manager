/** 用假的 cordis 上下文验证 apply() 的接线与全部 /api 端点。 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { strToU8, zipSync } from 'fflate'

import { apply, defaultSkillsFor, ROUTE_PREFIX } from '../lib/index.js'

/**
 * 建一个最小可用的假上下文。
 * @returns {{ ctx: object, routes: Map<string, object>, providers: object[], sections: object[], services: Map<string, any>, handlers: Map<string, Function>, expose: Function }} 环境
 */
function fakeContext() {
  const routes = new Map()
  const providers = []
  const sections = []
  const services = new Map()
  const handlers = new Map()
  const ctx = {
    get: (service) => services.get(service),
    effect: (factory) => {
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject: (_names, callback) => callback(ctx),
    on: (event, callback) => {
      handlers.set(event, callback)
      return () => handlers.delete(event)
    },
  }
  // cordis 把服务同时暴露成上下文属性，插件里两种取法都有；假上下文要对齐。
  const expose = (service, value) => {
    services.set(service, value)
    ctx[service] = value
    return value
  }
  expose('skills', {
    registerProvider(create) {
      const controller = new AbortController()
      providers.push(create({ signal: controller.signal, invalidate: () => {} }))
      return () => {}
    },
    async snapshot() {
      return { skills: [], complete: true }
    },
  })
  expose('systemPrompt', {
    section(section) {
      sections.push(section)
      return () => {}
    },
  })
  expose('webServer', { port: 0 })
  expose('connection', {
    fetch: {
      register(route) {
        routes.set(route.path, route)
        return () => {}
      },
    },
  })
  expose('sessions', { list: () => [] })
  return { ctx, routes, providers, sections, services, handlers, expose }
}

/**
 * 调一个端点。
 * @param {Map<string, object>} routes - 路由表
 * @param {string} path - 端点路径
 * @param {{ method?: string, body?: unknown }} [options] - 请求参数
 * @returns {Promise<any>} JSON 响应
 */
async function call(routes, path, options = {}) {
  const route = routes.get(`${ROUTE_PREFIX}${path}`)
  assert.ok(route, `端点未注册：${path}`)
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST')
  assert.ok(route.methods.includes(method), `${path} 未声明 ${method}`)
  const request = new Request(`http://127.0.0.1${ROUTE_PREFIX}${path}${options.query ?? ''}`, {
    method,
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const response = await route.fetch(request)
  return response.json()
}

/**
 * 建一个带技能的工作区。
 * @returns {{ cwd: string, dshHome: string }} 路径
 */
function workspace() {
  const base = mkdtempSync(join(tmpdir(), 'skm-plugin-'))
  const cwd = join(base, 'project')
  const dshHome = join(base, 'dsh-home')
  mkdirSync(join(cwd, '.git'), { recursive: true })
  for (const [name, description, body] of [
    ['sprint-planner', '把 backlog 排成 sprint plan', '按产能裁剪 backlog。'],
    ['competitor-teardown', '拆解竞争对手定价', '列出三家的定价与功能。'],
  ]) {
    mkdirSync(join(cwd, '.dsh', 'skills', name), { recursive: true })
    writeFileSync(join(cwd, '.dsh', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`, 'utf8')
  }
  return { cwd, dshHome }
}

test('接线：注册 1 个提供方、16 条路由、1 个默认加载段', () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })
  assert.equal(fake.providers.length, 1, '宿主层应注册一个覆盖提供方')
  assert.equal(fake.routes.size, 16, '十六个端点都应注册')
  assert.equal(fake.sections.length, 1, '默认加载应注册一个 prompt 段')
  assert.equal(fake.sections[0].name, 'skill-manager:default-loaded')
})

test('catalog：列出技能并标注来源与分类', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })
  const payload = await call(fake.routes, '/catalog', { query: `?cwd=${encodeURIComponent(cwd)}` })
  assert.equal(payload.ok, true)
  assert.equal(payload.skills.length, 2)
  assert.ok(payload.skills.every((skill) => skill.enabled === true))
  assert.ok(payload.roots.some((root) => root.key === 'project-dsh'))
  assert.match(payload.preferencesPath, /preferences\.json$/)
})

test('偏好吗：停用后 catalog 反映状态，覆盖提供方发出 rank 0 候选', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })
  const before = await call(fake.routes, '/catalog', { query: `?cwd=${encodeURIComponent(cwd)}` })
  const saved = await call(fake.routes, '/preferences', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { preferences: { ...before.preferences, disabled: ['sprint-planner'] } },
  })
  assert.deepEqual(saved.preferences.disabled, ['sprint-planner'])

  const after = await call(fake.routes, '/catalog', { query: `?cwd=${encodeURIComponent(cwd)}` })
  assert.equal(after.skills.find((skill) => skill.name === 'sprint-planner').enabled, false)

  const candidates = await fake.providers[0].list({ cwd })
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['sprint-planner'])
  assert.equal(candidates[0].invocation.modelInvocable, false)
})

test('分类：智能归类给出建议，偏好里能存下分类', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })
  const result = await call(fake.routes, '/classify', { query: `?cwd=${encodeURIComponent(cwd)}`, body: { categories: [], autoCreate: false, mode: 'heuristic' } })
  assert.equal(result.ok, true)
  const planner = result.suggestions.find((item) => item.skill === 'sprint-planner')
  const competitor = result.suggestions.find((item) => item.skill === 'competitor-teardown')
  assert.equal(planner.categoryId, 'planning')
  assert.equal(competitor.categoryId, 'competitor-analysis')

  const saved = await call(fake.routes, '/preferences', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { preferences: { disabled: [], defaultLoaded: [], categories: [{ id: 'planning', name: '项目规划', keywords: [], skills: ['sprint-planner'] }] } },
  })
  assert.equal(saved.preferences.categories[0].skills[0], 'sprint-planner')
})

test('写操作：新建、保存、导入、删除都落在技能根里', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })

  const created = await call(fake.routes, '/skill/create', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'api-design', rootKey: 'project-dsh', description: '接口设计', whenToUse: '', body: '先定契约。', disableModelInvocation: false, userInvocable: false },
  })
  assert.equal(created.ok, true)

  const duplicated = await call(fake.routes, '/skill/create', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'api-design', rootKey: 'project-dsh', description: '重复', body: '' },
  })
  assert.equal(duplicated.ok, false)

  const saved = await call(fake.routes, '/skill/save', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'api-design', rootKey: 'project-dsh', description: '改过的描述', body: '改过的正文', disableModelInvocation: true, userInvocable: true },
  })
  assert.equal(saved.ok, true)

  const read = await call(fake.routes, '/skill', { query: `?cwd=${encodeURIComponent(cwd)}&name=api-design&rootKey=project-dsh` })
  assert.match(read.content, /改过的描述/)
  assert.match(read.content, /disable-model-invocation: true/)

  const imported = await call(fake.routes, '/skill/import', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { text: '---\ndescription: 粘贴来的\n---\n\n# Pasted Skill\n\n正文\n', rootKey: 'project-dsh' },
  })
  assert.equal(imported.name, 'pasted-skill')

  const removed = await call(fake.routes, '/skill/delete', { query: `?cwd=${encodeURIComponent(cwd)}`, body: { name: 'api-design', rootKey: 'project-dsh' } })
  assert.equal(removed.ok, true)
  const missing = await call(fake.routes, '/skill', { query: `?cwd=${encodeURIComponent(cwd)}&name=api-design&rootKey=project-dsh` })
  assert.equal(missing.ok, false)
})

test('默认加载：prompt 段里出现被标记技能的正文', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })
  await call(fake.routes, '/preferences', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { preferences: { disabled: [], defaultLoaded: ['sprint-planner'], categories: [] } },
  })
  const section = fake.sections[0]
  const text = typeof section.text === 'function' ? section.text({}) : section.text
  assert.match(text, /sprint-planner/)
  assert.match(text, /按产能裁剪 backlog/)
  assert.equal(section.order, 7000)
  assert.equal(section.interpolate, false)
})

test('导入：目录与 zip 都能落成技能，越界 zip 被拒', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })

  const sourceBase = mkdtempSync(join(tmpdir(), 'skm-src-'))
  const sourceSkill = join(sourceBase, 'wrapper', 'imported-skill')
  mkdirSync(sourceSkill, { recursive: true })
  writeFileSync(join(sourceSkill, 'SKILL.md'), '---\nname: imported-skill\ndescription: 从目录导入\n---\n\n目录导入的正文\n', 'utf8')
  writeFileSync(join(sourceSkill, 'notes.md'), '附带文件\n', 'utf8')

  const dirResult = await call(fake.routes, '/skill/import-dir', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { sourcePath: join(sourceBase, 'wrapper'), rootKey: 'project-dsh' },
  })
  assert.equal(dirResult.ok, true, dirResult.error)
  assert.equal(dirResult.name, 'imported-skill')
  const imported = await call(fake.routes, '/skill', { query: `?cwd=${encodeURIComponent(cwd)}&name=imported-skill&rootKey=project-dsh` })
  assert.match(imported.content, /目录导入的正文/)

  const zipData = Buffer.from(zipSync({
    'zip-skill/SKILL.md': strToU8('---\nname: zipped-skill\ndescription: 来自 zip\n---\n\nzip 导入的正文\n'),
    'zip-skill/reference.md': strToU8('参考\n'),
  })).toString('base64')
  const zipResult = await call(fake.routes, '/skill/import-zip', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { data: zipData, rootKey: 'project-dsh' },
  })
  assert.equal(zipResult.ok, true, zipResult.error)
  assert.equal(zipResult.name, 'zipped-skill')

  const unsafe = Buffer.from(zipSync({ '../evil/SKILL.md': strToU8('---\nname: evil\n---\n') })).toString('base64')
  const unsafeResult = await call(fake.routes, '/skill/import-zip', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { data: unsafe, rootKey: 'project-dsh' },
  })
  assert.equal(unsafeResult.ok, false)
  assert.equal(unsafeResult.code, 'import.unsafe')
})

test('目录选择器：native 能力返回宿主选中的路径', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  fake.expose('directoryPicker', { capability: () => ({ kind: 'native', pick: async () => 'D:\\picked\\skill' }) })
  apply(fake.ctx, { dshHome, cwd })
  const picked = await call(fake.routes, '/pick-directory', { query: `?cwd=${encodeURIComponent(cwd)}`, body: {} })
  assert.equal(picked.ok, true)
  assert.equal(picked.path, 'D:\\picked\\skill')

  const browseOnly = fakeContext()
  browseOnly.expose('directoryPicker', { capability: () => ({ kind: 'browse' }) })
  apply(browseOnly.ctx, { dshHome, cwd })
  const refused = await call(browseOnly.routes, '/pick-directory', { query: `?cwd=${encodeURIComponent(cwd)}`, body: {} })
  assert.equal(refused.ok, false)
  assert.equal(refused.kind, 'browse')
})

test('默认加载作用域：全局 + 本项目 + 本预设合并，其它项目只有全局', async () => {
  const { cwd, dshHome } = workspace()
  // global-skill 放在用户根，任何项目都能看到；另外两个放在项目根。
  mkdirSync(join(dshHome, 'skills', 'global-skill'), { recursive: true })
  writeFileSync(join(dshHome, 'skills', 'global-skill', 'SKILL.md'), '---\nname: global-skill\ndescription: 全局默认\n---\n\nglobal-skill 正文\n', 'utf8')
  for (const name of ['project-skill', 'preset-skill']) {
    mkdirSync(join(cwd, '.dsh', 'skills', name), { recursive: true })
    writeFileSync(join(cwd, '.dsh', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n\n${name} 正文\n`, 'utf8')
  }
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })
  await call(fake.routes, '/preferences', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: {
      preferences: {
        disabled: [],
        defaultLoaded: ['global-skill'],
        defaultScopes: [
          { kind: 'project', target: cwd, skills: ['project-skill'] },
          { kind: 'preset', target: 'standard', skills: ['preset-skill'] },
        ],
        categories: [],
      },
    },
  })

  const agentProviders = []
  const agentSections = []
  const agentSkills = {
    registerProvider(create) {
      agentProviders.push(create({ signal: new AbortController().signal, invalidate: () => {} }))
      return () => {}
    },
  }
  const agentPrompt = { section: (section) => { agentSections.push(section); return () => {} } }
  const agentCtx = { get: (service) => (service === 'skills' ? agentSkills : service === 'systemPrompt' ? agentPrompt : undefined) }

  const created = fake.handlers.get('agent/created')
  assert.ok(created, '应订阅 agent/created')
  created({ agent: { id: 'agent-1', session: { header: { cwd, meta: { agentPreset: 'standard' } } }, ctx: agentCtx } })

  assert.equal(agentProviders.length, 1, 'agent 作用域也要注册覆盖提供方')
  assert.equal(agentSections.length, 1, 'agent 作用域要注册默认加载段')
  const text = agentSections[0].text({})
  assert.match(text, /global-skill/)
  assert.match(text, /project-skill/)
  assert.match(text, /preset-skill/)

  // 换一个项目 + 换一个预设：只剩全局默认。
  const otherCwd = mkdtempSync(join(tmpdir(), 'skm-other-'))
  mkdirSync(join(otherCwd, '.git'), { recursive: true })
  const otherSections = []
  created({
    agent: {
      id: 'agent-2',
      session: { header: { cwd: otherCwd, meta: { agentPreset: 'minimal' } } },
      ctx: { get: (service) => (service === 'skills' ? agentSkills : service === 'systemPrompt' ? { section: (section) => { otherSections.push(section); return () => {} } } : undefined) },
    },
  })
  const otherText = otherSections[0].text({})
  assert.match(otherText, /global-skill/)
  assert.doesNotMatch(otherText, /project-skill/)
  assert.doesNotMatch(otherText, /preset-skill/)
})

test('作用域解析：路径大小写与尾分隔符不影响匹配', () => {
  const preferences = {
    defaultLoaded: [],
    defaultScopes: [
      { id: 'p', kind: 'project', target: 'D:\\Demo\\', skills: ['a'] },
      { id: 's', kind: 'preset', target: 'Standard', skills: ['b'] },
    ],
  }
  assert.deepEqual(defaultSkillsFor(preferences, { cwd: 'd:\\demo', preset: 'standard' }), ['a', 'b'])
  assert.deepEqual(defaultSkillsFor(preferences, { cwd: 'D:\\other', preset: 'minimal' }), [])
})

test('智能归类兜底：模型不可用时按阶段关键词归类', async () => {
  const { cwd, dshHome } = workspace()
  for (const [name, body] of [
    ['funnel-check', '检查各渠道的转化率，找出流失节点。转化率低于基线时告警。'],
    ['conversion-lab', '对转化率做 A/B 实验，比较不同落地页的转化率。'],
    ['meeting-notes', '整理会议纪要并归档。'],
  ]) {
    mkdirSync(join(cwd, '.dsh', 'skills', name), { recursive: true })
    writeFileSync(join(cwd, '.dsh', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${name}\n---\n\n${body}\n`, 'utf8')
  }
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })

  const result = await call(fake.routes, '/classify', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { categories: [], autoCreate: true },
  })
  assert.equal(result.ok, true)
  assert.equal(result.source, 'heuristic', '模型不可用时应标记为兜底')
  assert.ok(result.created.length > 0, '应自动新建阶段分类')
  const grouped = result.categories.find((category) => category.skills.includes('funnel-check') && category.skills.includes('conversion-lab'))
  assert.ok(grouped, '两个讲转化率的技能应被分到同一阶段')
  assert.equal(grouped.name, '运营增长', '兜底也必须是阶段名，而不是字面词')
  assert.ok(result.categories.find((category) => category.skills.includes('meeting-notes')), '会议纪要也要有归属')

  const saved = await call(fake.routes, '/preferences', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { preferences: { ...(await readPrefs(fake, cwd)), categories: result.categories } },
  })
  assert.equal(saved.ok, true)
})

test('AI 描述：模型返回 JSON 时给出建议，失败时退回本地兜底', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  const reply = JSON.stringify({ description: '把需求拆成 sprint', whenToUse: '迭代开始前', category: '排期', translated: 'Break work into sprints' })
  fake.expose('llm', {
    async *stream() {
      yield { type: 'text-delta', text: reply }
    },
  })
  apply(fake.ctx, { dshHome, cwd })

  const ok = await call(fake.routes, '/skill/describe', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'sprint-planner', rootKey: 'project-dsh', lang: 'en' },
  })
  assert.equal(ok.ok, true, ok.error)
  assert.equal(ok.source, 'llm')
  assert.equal(ok.description, '把需求拆成 sprint')
  assert.equal(ok.category, '排期')

  const broken = fakeContext()
  broken.expose('llm', {
    async *stream() {
      throw new Error('provider 未配置')
    },
  })
  apply(broken.ctx, { dshHome, cwd })
  const fallback = await call(broken.routes, '/skill/describe', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'sprint-planner', rootKey: 'project-dsh', lang: 'zh' },
  })
  assert.equal(fallback.ok, false)
  assert.equal(fallback.source, 'heuristic')
  assert.match(fallback.error, /provider 未配置/)
})

test('只改元数据：/skill/meta 更新描述但保留正文', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })

  const saved = await call(fake.routes, '/skill/meta', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'sprint-planner', rootKey: 'project-dsh', description: '新的描述', whenToUse: '迭代开始时' },
  })
  assert.equal(saved.ok, true)
  const read = await call(fake.routes, '/skill', { query: `?cwd=${encodeURIComponent(cwd)}&name=sprint-planner&rootKey=project-dsh` })
  assert.match(read.content, /新的描述/)
  assert.match(read.content, /迭代开始时/)
  assert.match(read.content, /按产能裁剪 backlog/, '正文必须保留')
})

test('AI 阶段分类：按模型给的阶段名建分类', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  const reply = JSON.stringify({
    categories: [
      { name: '开发实现', skills: ['sprint-planner'] },
      { name: '竞品分析', skills: ['competitor-teardown'] },
    ],
  })
  fake.expose('llm', {
    async *stream() {
      yield { type: 'text-delta', text: reply }
    },
  })
  apply(fake.ctx, { dshHome, cwd })

  const result = await call(fake.routes, '/classify', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { categories: [], mode: 'ai', autoCreate: true },
  })
  assert.equal(result.source, 'llm')
  const dev = result.categories.find((category) => category.name === '开发实现')
  assert.ok(dev, '应按阶段名建分类')
  assert.ok(dev.skills.includes('sprint-planner'))
  assert.equal(dev.auto, true, '自动分类要打 auto 标记，便于下次重算时替换')
  assert.ok(result.categories.find((category) => category.name === '竞品分析'))
})

test('AI 建议走旁路：不改原文，可忽略', async () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  fake.expose('llm', {
    async *stream() {
      yield {
        type: 'text-delta',
        text: JSON.stringify({ description: '把需求拆成可执行的迭代', whenToUse: '排期时', category: '项目规划', translated: '' }),
      }
    },
  })
  apply(fake.ctx, { dshHome, cwd })

  const described = await call(fake.routes, '/skill/describe', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'sprint-planner', rootKey: 'project-dsh', lang: 'zh' },
  })
  assert.equal(described.ok, true)

  const catalog = await call(fake.routes, '/catalog', { query: `?cwd=${encodeURIComponent(cwd)}` })
  const row = catalog.skills.find((skill) => skill.name === 'sprint-planner')
  assert.equal(row.aiSuggestion?.description, '把需求拆成可执行的迭代')
  assert.equal(row.aiSuggestion?.category, '项目规划')
  assert.match(row.description, /把 backlog 排成 sprint plan/, '原描述必须原样保留')

  const onDisk = readFileSync(join(cwd, '.dsh', 'skills', 'sprint-planner', 'SKILL.md'), 'utf8')
  assert.match(onDisk, /把 backlog 排成 sprint plan/, '文件不能被建议改写')
  assert.doesNotMatch(onDisk, /把需求拆成可执行的迭代/)

  await call(fake.routes, '/skill/suggestion', { query: `?cwd=${encodeURIComponent(cwd)}`, body: { name: 'sprint-planner' } })
  const after = await call(fake.routes, '/catalog', { query: `?cwd=${encodeURIComponent(cwd)}` })
  assert.equal(after.skills.find((skill) => skill.name === 'sprint-planner').aiSuggestion, undefined)

  // 采纳时才写回文件。
  await call(fake.routes, '/skill/describe', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'sprint-planner', rootKey: 'project-dsh', lang: 'zh' },
  })
  await call(fake.routes, '/skill/meta', {
    query: `?cwd=${encodeURIComponent(cwd)}`,
    body: { name: 'sprint-planner', rootKey: 'project-dsh', description: '把需求拆成可执行的迭代' },
  })
  const accepted = readFileSync(join(cwd, '.dsh', 'skills', 'sprint-planner', 'SKILL.md'), 'utf8')
  assert.match(accepted, /把需求拆成可执行的迭代/)
  assert.match(accepted, /按产能裁剪 backlog/, '正文仍在')
})

/**
 * 读当前偏好。
 * @param {object} fake - 假上下文
 * @param {string} cwd - 工作目录
 * @returns {Promise<object>} 偏好
 */
async function readPrefs(fake, cwd) {
  return (await call(fake.routes, '/catalog', { query: `?cwd=${encodeURIComponent(cwd)}` })).preferences
}
