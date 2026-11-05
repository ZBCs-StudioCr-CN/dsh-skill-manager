/**
 * 用 jsdom + react-dom 把真实构建产物挂起来渲染，验证面板能显示真实数据并能交互。
 * 这补上了「bundle 能加载」与「界面上真的能用」之间的空白。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const bundle = readFileSync(join(import.meta.dirname, '..', 'client', 'client.js'), 'utf8')

/** 假的目录响应，形状与宿主 /catalog 一致。 */
function catalogPayload() {
  return {
    ok: true,
    cwd: 'D:\\demo',
    projectRoot: 'D:\\demo',
    roots: [
      { key: 'project-dsh', source: 'project-dsh', rank: 100, path: 'D:\\demo\\.dsh\\skills', readOnly: false },
      { key: 'user-dsh', source: 'user-dsh', rank: 400, path: 'C:\\Users\\x\\.dsh\\skills', readOnly: false },
    ],
    skillRoot: 'D:\\demo\\.dsh\\skills',
    preferencesPath: 'C:\\Users\\x\\.dsh\\skill-manager\\preferences.json',
    preferences: {
      version: 1,
      disabled: ['legacy-skill'],
      defaultLoaded: ['sprint-planner'],
      defaultScopes: [],
      categories: [{ id: 'planning', name: '项目规划', keywords: [], skills: ['sprint-planner'] }],
    },
    skills: [
      {
        name: 'sprint-planner', description: '把 backlog 排成 sprint 计划', whenToUse: '',
        path: 'D:\\demo\\.dsh\\skills\\sprint-planner\\SKILL.md', rootKey: 'project-dsh', source: 'project-dsh',
        rank: 100, readOnly: false, modelInvocable: true, userInvocable: true,
        enabled: true, defaultLoaded: true, categoryIds: ['planning'],
      },
      {
        name: 'legacy-skill', description: '一个被停用的技能', whenToUse: '',
        path: 'C:\\Users\\x\\.dsh\\skills\\legacy-skill\\SKILL.md', rootKey: 'user-dsh', source: 'user-dsh',
        rank: 400, readOnly: false, modelInvocable: true, userInvocable: true,
        enabled: false, defaultLoaded: false, categoryIds: [],
      },
    ],
    shadowed: [],
  }
}

/**
 * 建 jsdom 环境并把 bundle 注册进来。
 * @returns {{ dom: JSDOM, module: any, requests: Array<object> }} 环境
 */
function mountEnvironment() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: 'http://127.0.0.1:57788/',
    pretendToBeVisual: true,
  })
  const requests = []
  const window = dom.window
  window.__ModuleLoader__ = {
    load: ({ id, factory }) => {
      assert.equal(id, 'dsh-skill-manager')
      window.loaded = factory(require)
    },
  }
  // 面板走 fetch + 剪贴板；两个都给出可控替身。
  window.fetch = async (url, init = {}) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    requests.push({ path, method: init.method ?? 'GET', body: init.body })
    if (path.startsWith('/api/dsh-skill-manager/catalog')) {
      return { status: 200, json: async () => catalogPayload(), text: async () => JSON.stringify(catalogPayload()) }
    }
    if (path.startsWith('/api/dsh-skill-manager/preferences')) {
      const body = JSON.parse(init.body)
      return { status: 200, json: async () => ({ ok: true, preferences: body.preferences }), text: async () => '{}' }
    }
    return { status: 200, json: async () => ({ ok: true }), text: async () => '{}' }
  }
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async () => {}, readText: async () => '' },
    configurable: true,
  })
  // bundle 里的 fetch 是自由变量，落到 Node 全局；换成同一个替身，相对路径才不会报错。
  globalThis.fetch = window.fetch

  // 让 react-dom 看到这个 DOM。Node 24 的 globalThis.navigator 是只读 getter，得用 defineProperty。
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
  globalThis.HTMLElement = window.HTMLElement
  globalThis.Element = window.Element
  globalThis.Node = window.Node
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  new Function('window', 'document', 'require', bundle)(window, window.document, require)
  return { dom, module: window.loaded, requests }
}

/**
 * 渲染面板并等副作用跑完。
 * @param {object} module - 插件模块
 * @param {JSDOM} dom - jsdom
 * @returns {Promise<{ container: any, act: Function }>} 渲染结果
 */
async function renderPanel(module, dom) {
  const React = require('react')
  const { createRoot } = require('react-dom/client')
  // React 18.3 起 act 由 react 自己导出；退回 test-utils 只为兼容更老的 18.x。
  const act = React.act ?? require('react-dom/test-utils').act

  const captured = []
  const ctx = {
    effect: (factory) => {
      const dispose = factory()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (options, component) => {
        captured.push({ options, component })
        return () => {}
      },
    },
  }
  module.apply(ctx)
  const panelEntry = captured.find((item) => item.options.name === 'main')
  assert.ok(panelEntry, '应注册 main 面板')

  const Panel = panelEntry.component
  const container = dom.window.document.getElementById('root')
  const root = createRoot(container)
  await act(async () => {
    root.render(React.createElement(Panel, {}))
  })
  // 让 catalog 的 promise 链落地。
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  return { container, act, root }
}

test('界面：真实构建产物在 DOM 里渲染出技能与分类', async () => {
  const { dom, module, requests } = mountEnvironment()
  const { container } = await renderPanel(module, dom)
  const text = container.textContent

  assert.match(text, /技能管理/, '标题应渲染')
  assert.match(text, /\/sprint-planner/, '技能名应渲染')
  assert.match(text, /\/legacy-skill/, '被停用的技能也要显示')
  assert.match(text, /智能归类/, '工具栏按钮应渲染')
  assert.match(text, /项目规划/, '分类 chip 应渲染')
  assert.match(text, /默认·全局/, '默认加载标记应带作用域')
  assert.match(text, /导入目录/, '应有目录导入入口')
  assert.match(text, /导入 ZIP/, '应有 zip 导入入口')
  assert.match(text, /本项目/, '应有默认加载作用域选择')
  assert.match(text, /2 个技能/, '统计行应显示真实数量')
  assert.ok(requests.some((request) => request.path.startsWith('/api/dsh-skill-manager/catalog')), '应请求过 catalog')
})

test('界面：点一下启用开关会写回偏好', async () => {
  const { dom, module, requests } = mountEnvironment()
  const { container, act } = await renderPanel(module, dom)

  const switchButton = [...container.querySelectorAll('button')].find((button) => button.className.includes('skm-switch'))
  assert.ok(switchButton, '应找到启用开关')
  await act(async () => {
    switchButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  const posted = requests.filter((request) => request.path.startsWith('/api/dsh-skill-manager/preferences'))
  assert.equal(posted.length, 1, '应提交一次偏好写入')
  const body = JSON.parse(posted[0].body)
  assert.ok(Array.isArray(body.preferences.disabled), '提交体应带 disabled 数组')
})

test('界面：搜索过滤只留下匹配项', async () => {
  const { dom, module } = mountEnvironment()
  const { container, act } = await renderPanel(module, dom)

  const input = container.querySelector('input[placeholder="搜索技能名或描述"]')
  assert.ok(input, '应有搜索框')
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setValue.call(input, 'legacy')
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  const text = container.textContent
  assert.match(text, /\/legacy-skill/, '匹配项应保留')
  assert.doesNotMatch(text, /\/sprint-planner/, '不匹配项应被过滤')
})

test('界面：切到「本项目」作用域后设默认，写入 defaultScopes', async () => {
  const { dom, module, requests } = mountEnvironment()
  const { container, act } = await renderPanel(module, dom)

  // 工具栏里已经有语言选择器，这里要按选项找作用域选择器。
  const select = [...container.querySelectorAll('select')].find((element) =>
    [...element.options].some((option) => option.value === 'project'),
  )
  assert.ok(select, '应有作用域选择器')
  const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set
  await act(async () => {
    setValue.call(select, 'project')
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })

  const setDefault = [...container.querySelectorAll('button')].find((button) => button.textContent === '设默认')
  assert.ok(setDefault, '应有设默认按钮')
  await act(async () => {
    setDefault.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  const posted = requests.filter((request) => request.path.startsWith('/api/dsh-skill-manager/preferences'))
  assert.equal(posted.length, 1, '应提交一次偏好写入')
  const body = JSON.parse(posted[0].body)
  assert.ok(Array.isArray(body.preferences.defaultScopes), '应带 defaultScopes')
  assert.equal(body.preferences.defaultScopes[0].kind, 'project')
  assert.equal(body.preferences.defaultScopes[0].target, 'D:\\demo')
  assert.deepEqual(body.preferences.defaultScopes[0].skills, ['sprint-planner'])
})
