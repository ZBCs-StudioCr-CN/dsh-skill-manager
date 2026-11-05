/**
 * 把浏览器半边打成 DSH 客户端模块系统认识的 CJS 模块。
 *
 * 产物形如 `window.__ModuleLoader__.load({ id, factory })`：factory 拿到的 `require`
 * 由模块系统提供（react 等外置依赖从这里来），返回值就是插件的 `{ name, inject, apply }`。
 */

import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const outfile = join(root, 'client', 'client.js')

const result = await build({
  entryPoints: [join(here, 'src', 'client', 'index.ts')],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'transform',
  external: ['react'],
  legalComments: 'none',
  charset: 'utf8',
})

const code = result.outputFiles[0].text
const wrapped = `/* 生成文件：不要直接编辑，改 client/src/client/*.ts(x) 后运行 npm run build。 */
window.__ModuleLoader__.load({
  id: 'dsh-skill-manager',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    ;(function (module, exports, require) {
${code}
    })(module, exports, require)
    return module.exports
  },
})
`

mkdirSync(dirname(outfile), { recursive: true })
writeFileSync(outfile, wrapped, 'utf8')
console.log(`built ${outfile} (${(wrapped.length / 1024).toFixed(1)} KB)`)
