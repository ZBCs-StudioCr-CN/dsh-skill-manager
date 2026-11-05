/** 抓取运行中宿主的页面外壳，保存下来方便检查模块加载约定。 */

import { createHash, createHmac } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:57788'
const out = process.argv[3] ?? join(import.meta.dirname, '..', '.tmp', 'shell.html')

const b64 = (value) => Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
const credentials = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
const secret = Buffer.from(/browser-session:\s*\n(?:.*\n)*?\s*secret:\s*(\S+)/.exec(credentials)[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')
const authority = new URL(base).host
const name = `dsh-auth-${b64(createHash('sha256').update(authority).digest())}`
const now = Date.now()
const body = b64(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 86_400_000 }))
const cookie = `${name}=v1.${body}.${b64(createHmac('sha256', secret).update(body).digest())}`

const response = await fetch(base, { headers: { cookie } })
const html = await response.text()
mkdirSync(join(out, '..'), { recursive: true })
writeFileSync(out, html, 'utf8')
console.log(`HTTP ${response.status} → ${out} (${html.length} bytes)`)
