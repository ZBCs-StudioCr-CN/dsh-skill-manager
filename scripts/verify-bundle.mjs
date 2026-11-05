/** 从页面外壳里取出包含本插件的那条模块预加载地址，实际请求一次，确认宿主能下发我们的 bundle。 */

import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:57788'
const shellFile = process.argv[3] ?? join(import.meta.dirname, '..', '.tmp', 'shell.html')

const b64 = (value) => Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
const credentials = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
const secret = Buffer.from(/browser-session:\s*\n(?:.*\n)*?\s*secret:\s*(\S+)/.exec(credentials)[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')
const authority = new URL(base).host
const name = `dsh-auth-${b64(createHash('sha256').update(authority).digest())}`
const now = Date.now()
const body = b64(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 86_400_000 }))
const cookie = `${name}=v1.${body}.${b64(createHmac('sha256', secret).update(body).digest())}`

const shell = readFileSync(shellFile, 'utf8')
const links = [...shell.matchAll(/href="(plugins\/\?\?[^"]+)"/g)].map((match) => match[1].replaceAll('&amp;', '&'))
const ours = links.find((link) => link.includes('dsh-skill-manager'))
const rev = /dsh-skill-manager\/client\.js(?:&|&amp;)rev=([0-9a-f]+)/.exec(shell)?.[1]

console.log(`预加载链接 ${links.length} 条；包含本插件：${ours ? '是' : '否'}；rev=${rev ?? '未知'}`)
if (!ours) {
  process.exitCode = 1
} else {
  const url = `${base}/${ours}`
  const response = await fetch(url, { headers: { cookie } })
  const text = await response.text()
  console.log(`GET 合并模块地址 → HTTP ${response.status}，${text.length} 字节`)
  console.log(`  含本插件模块标记：${/dsh-skill-manager/.test(text)}；含模块注册：${/__ModuleLoader__/.test(text)}`)
  if (response.status !== 200) process.exitCode = 1
}
