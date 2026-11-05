/**
 * 用本机 ~/.dsh/.credentials.yaml 里的 browser-session 密钥签一个合法的
 * dsh-auth cookie，直接请求运行中的宿主，验证插件的 /api 端点。
 *
 * 只读本机凭据、只打 127.0.0.1，不联网。
 */

import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:57788'
const endpoint = process.argv[3] ?? '/api/dsh-skill-manager/catalog'
const cwd = process.argv[4]

/**
 * base64url 编码。
 * @param {Buffer|string} value - 值
 * @returns {string} 编码
 */
const b64url = (value) => Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

const credentials = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
const secretLine = /browser-session:\s*\n(?:.*\n)*?\s*secret:\s*(\S+)/.exec(credentials)
if (!secretLine) throw new Error('找不到 browser-session 密钥')
const secret = Buffer.from(secretLine[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')

const authority = new URL(base).host
const name = `dsh-auth-${b64url(createHash('sha256').update(authority).digest())}`
const now = Date.now()
const payload = { version: 1, authority, issuedAt: now, expiresAt: now + 86_400_000 }
const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
const value = `v1.${body}.${b64url(createHmac('sha256', secret).update(body).digest())}`

const url = `${base}${endpoint}${cwd ? `${endpoint.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(cwd)}` : ''}`
const response = await fetch(url, { headers: { cookie: `${name}=${value}` } })
const text = await response.text()
console.log(`HTTP ${response.status} ${endpoint}`)
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, 4000))
} catch {
  console.log(text.slice(0, 800))
}
