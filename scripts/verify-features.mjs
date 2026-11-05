/**
 * 在隔离实例上验证新功能：默认加载作用域 + 目录导入 + zip 导入。
 * 用法：node scripts/verify-features.mjs http://127.0.0.1:58803
 */

import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'

const base = process.argv[2] ?? 'http://127.0.0.1:58803'

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

const project = mkdtempSync(join(tmpdir(), 'skm-live-'))
mkdirSync(join(project, '.git'), { recursive: true })

try {
  const catalog = await call('/api/dsh-skill-manager/catalog', undefined, project)
  check('catalog 返回 200', catalog.status === 200)
  check('catalog 带 projectRoot', typeof catalog.json.projectRoot === 'string', catalog.json.projectRoot)
  check('偏好结构含 defaultScopes', Array.isArray(catalog.json.preferences.defaultScopes))

  const source = join(project, 'src', 'dir-skill')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, 'SKILL.md'), '---\nname: live-dir-skill\ndescription: 目录导入验证\n---\n\n目录导入正文\n', 'utf8')
  writeFileSync(join(source, 'reference.md'), '附带\n', 'utf8')
  const dirImport = await call('/api/dsh-skill-manager/skill/import-dir', { sourcePath: source, rootKey: 'project-dsh' }, project)
  check('目录导入', dirImport.status === 200 && dirImport.json.ok === true, dirImport.json.name ?? dirImport.json.error)

  const zip = Buffer.from(zipSync({
    'wrapped/zip-skill/SKILL.md': strToU8('---\nname: live-zip-skill\ndescription: zip 导入验证\n---\n\nzip 导入正文\n'),
    'wrapped/zip-skill/notes.md': strToU8('备注\n'),
  })).toString('base64')
  const zipImport = await call('/api/dsh-skill-manager/skill/import-zip', { data: zip, rootKey: 'project-dsh' }, project)
  check('zip 导入', zipImport.status === 200 && zipImport.json.ok === true, zipImport.json.name ?? zipImport.json.error)

  const afterImport = await call('/api/dsh-skill-manager/catalog', undefined, project)
  const names = (afterImport.json.skills ?? []).map((skill) => skill.name)
  check('两个导入的技能都在目录里', names.includes('live-dir-skill') && names.includes('live-zip-skill'), names.join(','))

  const saved = await call('/api/dsh-skill-manager/preferences', {
    preferences: {
      disabled: [],
      defaultLoaded: ['live-dir-skill'],
      defaultScopes: [
        { kind: 'project', target: project, skills: ['live-zip-skill'] },
        { kind: 'preset', target: 'standard', skills: ['live-dir-skill'] },
      ],
      categories: [],
    },
  }, project)
  check('写入作用域默认', saved.status === 200 && saved.json.preferences.defaultScopes.length === 2)

  const readBack = await call('/api/dsh-skill-manager/catalog', undefined, project)
  const scopes = readBack.json.preferences.defaultScopes
  check(
    '作用域可读回',
    scopes.some((item) => item.kind === 'project' && item.target.toLowerCase() === project.toLowerCase())
      && scopes.some((item) => item.kind === 'preset' && item.target === 'standard'),
  )

  for (const name of ['live-dir-skill', 'live-zip-skill']) {
    await call('/api/dsh-skill-manager/skill/delete', { name, rootKey: 'project-dsh' }, project)
  }
  const cleaned = await call('/api/dsh-skill-manager/catalog', undefined, project)
  check('清理完成', !(cleaned.json.skills ?? []).some((skill) => skill.name.startsWith('live-')))
} finally {
  rmSync(project, { recursive: true, force: true })
}

const failed = results.filter((item) => !item.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exitCode = failed.length === 0 ? 0 : 1
