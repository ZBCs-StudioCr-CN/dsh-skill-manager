/** 用假的 cordis 上下文验证 apply() 的接线与全部 /api 端点。 */

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply, ROUTE_PREFIX } from '../lib/index.js'

/**
 * 建一个最小可用的假上下文。
 * @returns {{ ctx: object, routes: Map<string, object>, providers: object[], sections: object[] }} 环境
 */
function fakeContext() {
  const routes = new Map()
  const providers = []
  const sections = []
  const services = new Map()
  const ctx = {
    get: (service) => services.get(service),
    effect: (factory) => {
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    inject: (_names, callback) => callback(ctx),
    on: () => () => {},
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
  return { ctx, routes, providers, sections }
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

test('接线：注册 1 个提供方、10 条路由、1 个默认加载段', () => {
  const { cwd, dshHome } = workspace()
  const fake = fakeContext()
  apply(fake.ctx, { dshHome, cwd })
  assert.equal(fake.providers.length, 1, '宿主层应注册一个覆盖提供方')
  assert.equal(fake.routes.size, 10, '十个端点都应注册')
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
  const result = await call(fake.routes, '/classify', { query: `?cwd=${encodeURIComponent(cwd)}`, body: { categories: [] } })
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
