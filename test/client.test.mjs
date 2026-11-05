/** 验证构建产物符合 DSH 客户端模块系统的约定：loader 形态、导出、槽位注册。 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'

const require = createRequire(import.meta.url)

/**
 * 在假的 window/document 里加载 bundle。
 * @returns {{ module: any, registered: any[], styleRemoved: () => boolean }} 结果
 */
function loadBundle() {
  const registered = []
  let styleTag
  let removed = false
  const document = {
    createElement: () => {
      styleTag = { dataset: {}, textContent: '', remove: () => { removed = true } }
      return styleTag
    },
    head: { appendChild: () => {} },
  }
  const window = {
    __ModuleLoader__: {
      load: ({ id, factory }) => {
        assert.equal(id, 'dsh-skill-manager')
        window.loaded = factory(require)
      },
    },
  }
  const code = readFileSync(join(import.meta.dirname, '..', 'client', 'client.js'), 'utf8')
  new Function('window', 'document', 'require', code)(window, document, require)
  return { module: window.loaded, registered, styleRemoved: () => removed, styleTag: () => styleTag }
}

test('bundle：导出 name / inject / apply', () => {
  const { module } = loadBundle()
  assert.equal(module.name, 'dsh-skill-manager')
  assert.deepEqual(module.inject, ['slots'])
  assert.equal(typeof module.apply, 'function')
})

test('bundle：apply 注入样式并注册 settings.section', () => {
  const { module, styleTag } = loadBundle()
  const registered = []
  const disposers = []
  const ctx = {
    effect: (factory) => {
      const dispose = factory()
      disposers.push(dispose)
      return dispose
    },
    slots: {
      inject: (slot, callback) => {
        assert.equal(slot, 'settings.section')
        callback()
      },
      register: (options, component) => {
        registered.push({ options, component })
        return () => {}
      },
    },
  }
  module.apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].options.name, 'settings.section')
  assert.equal(registered[0].options.id, 'dsh-skill-manager')
  assert.equal(registered[0].options.order, 62)
  assert.equal(registered[0].options.label(), '技能')
  assert.equal(typeof registered[0].component, 'function')
  assert.match(styleTag().textContent, /\.skm-section/)
  assert.equal(typeof disposers[0], 'function')
})
