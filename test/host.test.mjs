import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { listSkills, readSkillFile } from '../lib/catalog.js'
import { DEFAULT_CATEGORIES, suggestCategories, toCategoryId } from '../lib/classify.js'
import { parseSkill, serializeSkill } from '../lib/frontmatter.js'
import { createSkill, deleteSkill, importSkill, renderDefaultLoaded, saveSkill } from '../lib/operations.js'
import { createProvider } from '../lib/provider.js'
import { loadPreferences, normalizePreferences, savePreferences } from '../lib/store.js'

/**
 * 建一个临时技能根，写一个技能。
 * @param {string} root - 根目录
 * @param {string} name - 技能名
 * @param {string} description - 描述
 * @param {string} body - 正文
 * @returns {string} SKILL.md 路径
 */
function writeSkill(root, name, description, body = 'Do the thing.') {
  mkdirSync(join(root, name), { recursive: true })
  const path = join(root, name, 'SKILL.md')
  writeFileSync(path, `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`, 'utf8')
  return path
}

test('frontmatter：解析、保留未知键、往返稳定', () => {
  const source = '---\nname: demo\ndescription: "带引号的描述"\nlicense: MIT\nallowed-tools: [a, b]\n---\n\n正文内容\n'
  const parsed = parseSkill(source)
  assert.equal(parsed.attributes.name, 'demo')
  assert.equal(parsed.attributes.description, '带引号的描述')
  assert.equal(parsed.attributes.license, 'MIT')
  assert.equal(parsed.body.trim(), '正文内容')

  const next = serializeSkill(parsed, { name: 'demo', description: '新描述', body: '新的正文' })
  const reparsed = parseSkill(next)
  assert.equal(reparsed.attributes.description, '新描述')
  assert.equal(reparsed.attributes.license, 'MIT', '未托管的键必须保留')
  assert.equal(reparsed.body.trim(), '新的正文')
})

test('catalog：低 rank 根赢得同名技能，遮蔽记录可查', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skm-cat-'))
  const project = join(dir, 'project', '.dsh', 'skills')
  const user = join(dir, 'user', 'skills')
  mkdirSync(project, { recursive: true })
  mkdirSync(user, { recursive: true })
  writeSkill(project, 'shared', '项目里的版本')
  writeSkill(user, 'shared', '用户里的版本')
  writeSkill(user, 'only-user', '只在用户根')

  const roots = [
    { key: 'project-dsh', source: 'project-dsh', rank: 100, path: project },
    { key: 'user-dsh', source: 'user-dsh', rank: 400, path: user },
  ]
  const { skills, shadowed } = listSkills(roots)
  assert.equal(skills.length, 2)
  assert.equal(skills.find((skill) => skill.name === 'shared').source, 'project-dsh')
  assert.equal(shadowed.length, 1)
  assert.equal(shadowed[0].rootKey, 'user-dsh')
  assert.equal(shadowed[0].shadowedBy, 'project-dsh')
})

test('store：偏好读写与非法值收敛', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skm-store-'))
  const saved = savePreferences(dir, { disabled: ['a', 'a', 3], defaultLoaded: ['b'], categories: [{ id: 'x', name: 'X', skills: ['a'] }] })
  assert.ok(saved.endsWith('preferences.json'))
  const loaded = loadPreferences(dir)
  assert.deepEqual(loaded.preferences.disabled, ['a'])
  assert.equal(loaded.damaged, false)

  writeFileSync(join(dir, 'skill-manager', 'preferences.json'), '{not json', 'utf8')
  const broken = loadPreferences(dir)
  assert.equal(broken.damaged, true)
  assert.deepEqual(normalizePreferences(undefined).categories, [])
})

test('classify：关键词归类可解释，已归类的不重复建议', () => {
  assert.equal(toCategoryId('Market Analysis'), 'market-analysis')
  assert.match(toCategoryId('竞品 分析'), /^category-[a-z0-9]+$/)
  const skills = [
    { name: 'competitor-teardown', description: '拆解竞争对手的定价与功能' },
    { name: 'sprint-planner', description: '把 backlog 排成 sprint 计划' },
    { name: 'mystery', description: '什么关键词都没有' },
  ]
  const suggestions = suggestCategories(skills, DEFAULT_CATEGORIES)
  assert.equal(suggestions[0].categoryId, 'competitor-analysis')
  assert.equal(suggestions[1].categoryId, 'planning')
  assert.equal(suggestions[2].categoryId, null)
  assert.ok(suggestions[0].matched.length > 0)

  const assigned = suggestCategories(skills, [{ id: 'design', name: '设计', skills: ['competitor-teardown'] }])
  assert.equal(assigned[0].categoryId, null, '已归类的技能不再建议')
})

test('operations：新建 / 保存 / 导入 / 删除', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skm-ops-'))
  const root = { key: 'user-dsh', source: 'user-dsh', rank: 400, path: dir }

  assert.equal(createSkill({ root, name: 'Bad Name' }).ok, false)
  const created = createSkill({ root, name: 'new-skill', description: '新技能', body: '正文' })
  assert.equal(created.ok, true)
  assert.equal(createSkill({ root, name: 'new-skill', description: '重复', body: '' }).ok, false)

  const saved = saveSkill({ root, name: 'new-skill', description: '改过的描述', body: '改过的正文' })
  assert.equal(saved.ok, true)
  const parsed = parseSkill(readFileSync(created.path, 'utf8'))
  assert.equal(parsed.attributes.description, '改过的描述')

  const imported = importSkill({ root, text: '---\ndescription: 从剪贴板来的\n---\n\n# Clipboard Skill\n\n正文段落\n' })
  assert.equal(imported.ok, true)
  assert.equal(imported.name, 'clipboard-skill')
  assert.equal(readSkillFile(dir, 'clipboard-skill').parsed.attributes.description, '从剪贴板来的')

  assert.equal(deleteSkill({ root, name: 'new-skill' }).ok, true)
  assert.equal(readSkillFile(dir, 'new-skill'), undefined)

  const readonly = { ...root, readOnly: true }
  assert.equal(createSkill({ root: readonly, name: 'x', description: 'd', body: '' }).ok, false)
})

test('provider：只为被停用的技能发出 rank 0 候选', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'skm-prov-'))
  writeSkill(dir, 'kept', '保持启用')
  writeSkill(dir, 'off', '被停用')
  const provider = createProvider({ rootsFor: () => [{ key: 'user-dsh', source: 'user-dsh', rank: 400, path: dir }], isDisabled: (name) => name === 'off' })
  const candidates = await provider.list({})
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['off'])
  assert.equal(candidates[0].rank, 0)
  assert.equal(candidates[0].invocation.modelInvocable, false)

  const definition = await provider.get(candidates[0])
  assert.equal(definition.content.trim(), 'Do the thing.')
})

test('默认加载：正文按技能拼进 prompt 片段', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skm-default-'))
  writeSkill(dir, 'daily-standup', '站会', '每天写三行进展。')
  const text = renderDefaultLoaded([{ name: 'daily-standup', rootKey: 'user-dsh', path: join(dir, 'daily-standup', 'SKILL.md') }])
  assert.match(text, /默认加载/)
  assert.match(text, /每天写三行进展/)
  assert.match(text, /<skill name="daily-standup">/)
})
