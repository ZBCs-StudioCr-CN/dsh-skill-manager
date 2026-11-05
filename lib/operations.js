/** 写操作：新建 / 保存 / 删除 / 导入 SKILL.md，只允许落在已解析的技能根内。 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseSkill, serializeSkill } from './frontmatter.js'
import { isSkillName } from './names.js'
import { readSkillFile } from './catalog.js'

/**
 * 在一个根里定位技能目录。
 * @param {object} root - 根
 * @param {string} name - 技能名
 * @returns {string} 目录路径
 */
function skillDir(root, name) {
  return join(root.path, name)
}

/**
 * 校验可写根。
 * @param {object|undefined} root - 根
 * @param {string} name - 技能名
 * @returns {{ ok: true, root: object } | { ok: false, code: string, error: string }} 结果
 */
function writable(root, name) {
  if (!root) return { ok: false, code: 'root.unknown', error: '未知的技能根目录，请刷新后重试' }
  if (root.readOnly) return { ok: false, code: 'root.readonly', error: `${root.source} 是只读技能根，不能写入` }
  if (!isSkillName(name)) return { ok: false, code: 'name.invalid', error: `技能名必须是 kebab-case（小写字母、数字、连字符）：${name}` }
  return { ok: true, root }
}

/**
 * 新建一个用户技能。
 * @param {{ root: object|undefined, name: string, description: string, whenToUse?: string, body: string, disableModelInvocation?: boolean, userInvocable?: boolean }} input - 输入
 * @returns {{ ok: true, path: string } | { ok: false, code: string, error: string }} 结果
 */
export function createSkill(input) {
  const checked = writable(input.root, input.name)
  if (!checked.ok) return checked
  const dir = skillDir(checked.root, input.name)
  if (existsSync(dir)) return { ok: false, code: 'skill.exists', error: `技能 ${input.name} 已存在，未覆盖` }
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'SKILL.md')
  writeFileSync(path, serializeSkill({ attributes: {}, body: '' }, input), 'utf8')
  return { ok: true, path }
}

/**
 * 保存已有技能，保留未托管的 frontmatter 键。
 * @param {{ root: object|undefined, name: string, description: string, whenToUse?: string, body: string, disableModelInvocation?: boolean, userInvocable?: boolean }} input - 输入
 * @returns {{ ok: true, path: string } | { ok: false, code: string, error: string }} 结果
 */
export function saveSkill(input) {
  const checked = writable(input.root, input.name)
  if (!checked.ok) return checked
  const dir = skillDir(checked.root, input.name)
  const existing = readSkillFile(checked.root.path, input.name)
  if (!existing) return { ok: false, code: 'skill.unknown', error: `找不到技能 ${input.name}` }
  mkdirSync(dir, { recursive: true })
  writeFileSync(existing.path, serializeSkill(existing.parsed, input), 'utf8')
  return { ok: true, path: existing.path }
}

/**
 * 永久删除一个技能目录。
 * @param {{ root: object|undefined, name: string }} input - 输入
 * @returns {{ ok: true } | { ok: false, code: string, error: string }} 结果
 */
export function deleteSkill(input) {
  const checked = writable(input.root, input.name)
  if (!checked.ok) return checked
  const dir = skillDir(checked.root, input.name)
  if (!existsSync(dir)) return { ok: false, code: 'skill.unknown', error: `找不到技能 ${input.name}` }
  rmSync(dir, { recursive: true, force: true })
  return { ok: true }
}

/**
 * 从粘贴的 Markdown（可含 frontmatter）导入一个技能。
 * 名称优先级：显式参数 > frontmatter 的 name > 第一个标题 > 目录名。
 * @param {{ root: object|undefined, text: string, name?: string }} input - 输入
 * @returns {{ ok: true, name: string, path: string } | { ok: false, code: string, error: string }} 结果
 */
export function importSkill(input) {
  const text = String(input.text ?? '').trim()
  if (!text) return { ok: false, code: 'import.empty', error: '剪贴板内容为空' }
  const parsed = parseSkill(text)
  const heading = /^#\s+(.+)$/m.exec(parsed.body)?.[1]?.trim()
  const rawName = input.name || parsed.attributes.name || parsed.attributes.slug || heading || ''
  const name = rawName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const description = String(parsed.attributes.description ?? '').trim() || heading || name
  const checked = writable(input.root, name)
  if (!checked.ok) return checked
  return (() => {
    const dir = skillDir(checked.root, name)
    if (existsSync(dir)) return { ok: false, code: 'skill.exists', error: `技能 ${name} 已存在，未覆盖` }
    mkdirSync(dir, { recursive: true })
    const path = join(dir, 'SKILL.md')
    const body = parsed.body.replace(/^#\s+.+\n?/, '').trim() || parsed.body.trim()
    writeFileSync(
      path,
      serializeSkill(parsed, {
        name,
        description,
        whenToUse: parsed.attributes['when-to-use'],
        body,
        disableModelInvocation: String(parsed.attributes['disable-model-invocation'] ?? '').toLowerCase() === 'true',
        userInvocable: String(parsed.attributes['user-invocable'] ?? '').toLowerCase() === 'true',
      }),
      'utf8',
    )
    return { ok: true, name, path }
  })()
}

/**
 * 读一个技能的全文。
 * @param {{ root: object|undefined, name: string }} input - 输入
 * @returns {{ ok: true, name: string, path: string, content: string } | { ok: false, code: string, error: string }} 结果
 */
export function readSkill(input) {
  if (!input.root) return { ok: false, code: 'root.unknown', error: '未知的技能根目录' }
  const file = readSkillFile(input.root.path, input.name)
  if (!file) return { ok: false, code: 'skill.unknown', error: `找不到技能 ${input.name}` }
  return { ok: true, name: input.name, path: file.path, content: file.source }
}

/**
 * 把默认加载的技能正文拼成一段 prompt 片段。
 * @param {Array<{ name: string, rootKey: string, path: string }>} skills - 已解析的技能行
 * @returns {string} prompt 片段
 */
export function renderDefaultLoaded(skills) {
  const blocks = []
  for (const skill of skills) {
    try {
      const file = readFileSync(skill.path, 'utf8')
      const { body } = parseSkill(file)
      blocks.push(`<skill name="${skill.name}">\n${body.trim()}\n</skill>`)
    } catch {
      // 读不到就跳过，不让一段坏文件毁掉整次装配。
    }
  }
  if (blocks.length === 0) return ''
  return ['以下技能被用户设为「默认加载」，在本次对话开始时即生效：', '', ...blocks].join('\n')
}
