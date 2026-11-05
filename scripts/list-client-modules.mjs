/** 从抓下来的页面外壳里列出被预加载的客户端模块，并检查本插件是否在列。 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const file = process.argv[2] ?? join(import.meta.dirname, '..', '.tmp', 'shell.html')
const html = readFileSync(file, 'utf8')
const match = /href="(plugins\/\?\?[^"]+)"/.exec(html)
if (!match) {
  console.log('没有找到 plugins/?? 预加载列表')
  process.exit(1)
}
const specs = match[1].replace(/^plugins\/\?\?/, '').split(',')
console.log(`预加载模块数：${specs.length}`)
const ours = specs.filter((spec) => spec.includes('skill-manager'))
console.log(`本插件条目：${ours.length > 0 ? ours.join(', ') : '（不在列表里）'}`)
console.log('含 skill 的条目：')
for (const spec of specs.filter((item) => /skill/i.test(item))) console.log(`  ${spec}`)
