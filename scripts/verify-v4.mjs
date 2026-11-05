/**
 * v4 验证：AI 按阶段归类 + AI 建议走旁路（不改原文）。
 * 用法：node scripts/verify-v4.mjs http://127.0.0.1:58809
 */

import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:58809'

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
 * @param {string} [cwd] - 工作目录
 * @returns {Promise<any>} JSON
 */
async function call(path, payload, cwd) {
  const query = cwd ? `${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(cwd)}` : ''
  const response = await fetch(`${base}${path}${query}`, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { cookie, ...(payload === undefined ? {} : { 'content-type': 'application/json' }) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text, status: response.status }
  }
}

const results = []
const check = (label, ok, detail) => {
  results.push({ label, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const project = mkdtempSync(join(tmpdir(), 'skm-v4-'))
mkdirSync(join(project, '.git'), { recursive: true })
const skills = [
  ['user-interview', '访谈 5 位目标用户，整理需求清单与痛点优先级。'],
  ['pricing-model', '测算订阅定价与毛利，评估商业可行性。'],
  ['api-scaffold', '根据接口契约生成 Controller 与路由代码。'],
  ['token-audit', '审计上下文长度，压缩重复内容以节约 token。'],
]
for (const [name, text] of skills) {
  mkdirSync(join(project, '.dsh', 'skills', name), { recursive: true })
  writeFileSync(join(project, '.dsh', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: 原始描述-${text.slice(0, 12)}\n---\n\n${text}\n`, 'utf8')
}
const originalFile = join(project, '.dsh', 'skills', 'user-interview', 'SKILL.md')
const originalContent = readFileSync(originalFile, 'utf8')

try {
  const describe = await call('/api/dsh-skill-manager/skill/describe', { name: 'user-interview', rootKey: 'project-dsh', lang: 'zh' }, project)
  check('AI 描述调用成功', describe.ok === true && describe.source === 'llm', `${describe.description ?? ''}${describe.error ? ` err=${describe.error}` : ''}`)

  const catalog = await call('/api/dsh-skill-manager/catalog', undefined, project)
  const row = catalog.skills.find((skill) => skill.name === 'user-interview')
  check('目录里带 AI 建议', Boolean(row?.aiSuggestion?.description), row?.aiSuggestion?.description)
  check('原描述未被改写', /原始描述/.test(row.description), row.description)
  check('文件未被改写', readFileSync(originalFile, 'utf8') === originalContent)

  await call('/api/dsh-skill-manager/skill/suggestion', { name: 'user-interview' }, project)
  const afterDismiss = await call('/api/dsh-skill-manager/catalog', undefined, project)
  check('建议可忽略', afterDismiss.skills.find((skill) => skill.name === 'user-interview')?.aiSuggestion === undefined)

  const classify = await call('/api/dsh-skill-manager/classify', { categories: [], mode: 'ai', autoCreate: true }, project)
  check('AI 归类返回', classify.ok === true)
  check('归类来自模型', classify.source === 'llm', classify.warning ?? '')
  const names = (classify.categories ?? []).map((category) => category.name)
  console.log(`      阶段分类：${names.join(' / ')}`)
  for (const category of classify.categories ?? []) {
    console.log(`        ${category.name}: ${category.skills.join(', ')}`)
  }
  check('至少分成两个阶段', names.length >= 2)
  check('技能都被归入', (classify.categories ?? []).flatMap((category) => category.skills).length >= skills.length)

  await call('/api/dsh-skill-manager/preferences', { preferences: { disabled: [], defaultLoaded: [], defaultScopes: [], categories: [] } }, project)
  for (const [name] of skills) {
    await call('/api/dsh-skill-manager/skill/delete', { name, rootKey: 'project-dsh' }, project)
  }
  check('清理完成', true)
} finally {
  rmSync(project, { recursive: true, force: true })
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exitCode = failed.length === 0 ? 0 : 1
