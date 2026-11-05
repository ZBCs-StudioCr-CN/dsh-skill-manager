/**
 * 对运行中的宿主做一轮完整冒烟：归类 → 新建 → 读取 → 停用 → 注册表核对 → 删除 → 还原偏好。
 * 只打 127.0.0.1，用本机凭据签 cookie。
 */

import { createHash, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:57788'
const cwd = process.argv[3] ?? 'D:\\deepseek-harness'

const b64url = (value) => Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
const credentials = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
const secret = Buffer.from(/browser-session:\s*\n(?:.*\n)*?\s*secret:\s*(\S+)/.exec(credentials)[1].replaceAll('-', '+').replaceAll('_', '/'), 'base64')
const authority = new URL(base).host
const cookieName = `dsh-auth-${b64url(createHash('sha256').update(authority).digest())}`
const now = Date.now()
const body = b64url(Buffer.from(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 86_400_000 }), 'utf8'))
const cookie = `${cookieName}=v1.${body}.${b64url(createHmac('sha256', secret).update(body).digest())}`

/**
 * 调接口。
 * @param {string} path - 端点
 * @param {unknown} [payload] - POST 体
 * @returns {Promise<{ status: number, json: any }>} 结果
 */
async function call(path, payload) {
  const url = `${base}${path}${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(cwd)}`
  const response = await fetch(url, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { cookie, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = text
  }
  return { status: response.status, json }
}

const results = []
const check = (label, ok, detail) => {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const before = await call('/api/dsh-skill-manager/catalog')
check('catalog 返回 200', before.status === 200, `skills=${before.json.skills?.length}`)
const originalPrefs = before.json.preferences

const classify = await call('/api/dsh-skill-manager/classify', { categories: [] })
const planner = classify.json.suggestions?.find((item) => item.skill === 'acquisition-analysis')
check('智能归类给出建议', classify.status === 200 && classify.json.suggestions?.length > 0, `首条 → ${classify.json.suggestions?.[0]?.categoryId}`)

const created = await call('/api/dsh-skill-manager/skill/create', {
  name: 'smoke-test-skill', rootKey: 'project-dsh', description: '冒烟测试用，稍后删除',
  whenToUse: '', body: '这条技能由验证脚本创建。', disableModelInvocation: false, userInvocable: false,
})
check('新建技能', created.status === 200 && created.json.ok === true, created.json.path ?? created.json.error)

const read = await call('/api/dsh-skill-manager/skill?name=smoke-test-skill&rootKey=project-dsh')
check('读回技能正文', read.status === 200 && read.json.ok === true && /验证脚本创建/.test(read.json.content))

const disabled = await call('/api/dsh-skill-manager/preferences', {
  preferences: { ...originalPrefs, disabled: ['smoke-test-skill'] },
})
check('写入停用偏好', disabled.status === 200 && disabled.json.preferences.disabled.includes('smoke-test-skill'))

const registry = await call('/api/dsh-skill-manager/registry')
const row = registry.json.skills?.find((skill) => skill.name === 'smoke-test-skill')
check('注册表里该技能已不可调用', registry.status === 200 && row !== undefined && row.modelInvocable === false && row.provider === 'skill-manager',
  row ? `provider=${row.provider} modelInvocable=${row.modelInvocable}` : '注册表里没找到（说明停用生效为不可见）')

const removed = await call('/api/dsh-skill-manager/skill/delete', { name: 'smoke-test-skill', rootKey: 'project-dsh' })
check('删除技能', removed.status === 200 && removed.json.ok === true)

const restored = await call('/api/dsh-skill-manager/preferences', { preferences: originalPrefs })
check('还原偏好', restored.status === 200 && restored.json.preferences.disabled.length === originalPrefs.disabled.length)

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exitCode = failed.length === 0 ? 0 : 1
