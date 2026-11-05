/**
 * v3 功能验证：正文自动分类、AI 描述（真实模型）、元数据写入。
 * 用法：node scripts/verify-v3.mjs http://127.0.0.1:58804
 */

import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:58804'

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
 * @returns {Promise<{ status: number, json: any }>} 结果
 */
async function call(path, payload, cwd) {
  const query = cwd ? `${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(cwd)}` : ''
  const response = await fetch(`${base}${path}${query}`, {
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
  results.push({ label, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
}

const project = mkdtempSync(join(tmpdir(), 'skm-v3-'))
mkdirSync(join(project, '.git'), { recursive: true })
const skills = [
  ['funnel-check', '检查各渠道的转化率，找出流失节点。转化率低于基线时告警。'],
  ['conversion-lab', '对转化率做 A/B 实验，比较不同落地页的转化率。'],
  ['meeting-notes', '整理会议纪要并归档到知识库。'],
]
for (const [name, text] of skills) {
  mkdirSync(join(project, '.dsh', 'skills', name), { recursive: true })
  writeFileSync(join(project, '.dsh', 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: ${text.slice(0, 20)}\n---\n\n${text}\n`, 'utf8')
}

try {
  const catalog = await call('/api/dsh-skill-manager/catalog', undefined, project)
  check('catalog 正常', catalog.status === 200 && typeof catalog.json.projectRoot === 'string')

  const classify = await call('/api/dsh-skill-manager/classify', { categories: [], autoCreate: true }, project)
  check('自动归类返回分类', classify.status === 200 && Array.isArray(classify.json.categories))
  check('自动新建了分类', (classify.json.created?.length ?? 0) > 0, `created=${JSON.stringify(classify.json.created)}`)
  const group = (classify.json.categories ?? []).find((item) => item.skills.includes('funnel-check') && item.skills.includes('conversion-lab'))
  check('同主题技能被分到一组', Boolean(group), group ? `分类=${group.name}` : '未成组')

  const meta = await call('/api/dsh-skill-manager/skill/meta', { name: 'funnel-check', rootKey: 'project-dsh', description: '检查漏斗转化率', whenToUse: '复盘转化时' }, project)
  check('写入元数据', meta.status === 200 && meta.json.ok === true)
  const read = await call('/api/dsh-skill-manager/skill?name=funnel-check&rootKey=project-dsh', undefined, project)
  check('元数据落盘且正文保留', /检查漏斗转化率/.test(read.json.content) && /流失节点/.test(read.json.content))

  const describe = await call('/api/dsh-skill-manager/skill/describe', { name: 'funnel-check', rootKey: 'project-dsh', lang: 'en' }, project)
  check('AI 描述返回结果', describe.status === 200 && typeof describe.json === 'object')
  check('AI 描述来自模型', describe.json.source === 'llm', `source=${describe.json.source}${describe.json.error ? ` err=${describe.json.error}` : ''}`)
  check('AI 描述给出了描述文本', typeof describe.json.description === 'string' && describe.json.description.length > 0, describe.json.description)
  if (describe.json.translated) console.log(`      翻译：${describe.json.translated}`)
  if (describe.json.category) console.log(`      建议分类：${describe.json.category}`)

  for (const [name] of skills) {
    await call('/api/dsh-skill-manager/skill/delete', { name, rootKey: 'project-dsh' }, project)
  }
  await call('/api/dsh-skill-manager/preferences', { preferences: { disabled: [], defaultLoaded: [], defaultScopes: [], categories: [] } }, project)
  check('清理完成', true)
} finally {
  rmSync(project, { recursive: true, force: true })
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exitCode = failed.length === 0 ? 0 : 1
