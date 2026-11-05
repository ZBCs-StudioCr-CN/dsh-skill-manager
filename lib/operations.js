/** 写操作：新建 / 保存 / 删除 / 导入 SKILL.md，只允许落在已解析的技能根内。 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, normalize, relative, sep } from 'node:path'

import { unzipSync } from 'fflate'

import { parseSkill, serializeSkill } from './frontmatter.js'
import { isSkillName } from './names.js'
import { readSkillFile } from './catalog.js'

/**
 * 把任意名字转成合法的技能名。
 * @param {string} value - 原始名
 * @returns {string} kebab-case 名
 */
export function toSkillSlug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

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
  const name = toSkillSlug(rawName)
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

/**
 * 在候选目录里找一个技能根：自身含 SKILL.md，或唯一子目录含 SKILL.md（压缩包常见的多包一层）。
 * @param {string} base - 起始目录
 * @returns {string|undefined} 技能根目录
 */
function locateSkillRoot(base) {
  if (existsSync(join(base, 'SKILL.md'))) return base
  let children = []
  try {
    children = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory())
  } catch {
    return undefined
  }
  if (children.length === 1 && existsSync(join(base, children[0].name, 'SKILL.md'))) {
    return join(base, children[0].name)
  }
  return undefined
}

/**
 * 从一个技能目录读出名字：frontmatter 的 name 优先，否则用目录名。
 * @param {string} dir - 技能根
 * @returns {string} 技能名
 */
function nameOfSkillDir(dir) {
  const file = join(dir, 'SKILL.md')
  const parsed = existsSync(file) ? parseSkill(readFileSync(file, 'utf8')) : undefined
  return toSkillSlug(parsed?.attributes.name ?? '') || toSkillSlug(basename(dir)) || basename(dir)
}

/**
 * 从本地目录导入一个技能（整目录复制）。
 * @param {{ root: object|undefined, sourcePath: string }} input - 输入
 * @returns {{ ok: true, name: string, path: string } | { ok: false, code: string, error: string }} 结果
 */
export function importDirectory(input) {
  const source = String(input.sourcePath ?? '').trim()
  if (!source) return { ok: false, code: 'import.empty', error: '没有选择目录' }
  if (!isAbsolute(source)) return { ok: false, code: 'import.relative', error: '请给出绝对路径' }
  if (!existsSync(source) || !statSync(source).isDirectory()) return { ok: false, code: 'import.notfound', error: `目录不存在：${source}` }
  const skillRoot = locateSkillRoot(source)
  if (!skillRoot) return { ok: false, code: 'import.noskill', error: '该目录下没有找到 SKILL.md（也不含唯一的技能子目录）' }

  const name = nameOfSkillDir(skillRoot)
  const checked = writable(input.root, name)
  if (!checked.ok) return checked
  const target = skillDir(checked.root, name)
  if (existsSync(target)) return { ok: false, code: 'skill.exists', error: `技能 ${name} 已存在，未覆盖` }
  cpSync(skillRoot, target, { recursive: true })
  return { ok: true, name, path: join(target, 'SKILL.md') }
}

/**
 * 从 zip 包导入一个技能。拒绝越界路径（绝对路径、`..` 段）。
 * @param {{ root: object|undefined, data: string, name?: string }} input - data 为 base64
 * @returns {{ ok: true, name: string, path: string } | { ok: false, code: string, error: string }} 结果
 */
export function importZip(input) {
  const encoded = String(input.data ?? '')
  if (!encoded) return { ok: false, code: 'import.empty', error: '没有收到 zip 内容' }
  let files
  try {
    files = unzipSync(new Uint8Array(Buffer.from(encoded, 'base64')))
  } catch (error) {
    return { ok: false, code: 'import.badzip', error: `无法解压：${error instanceof Error ? error.message : String(error)}` }
  }

  /** @type {Map<string, Uint8Array>} 归一化后的相对路径 → 内容 */
  const entries = new Map()
  for (const [rawName, bytes] of Object.entries(files)) {
    if (rawName.endsWith('/')) continue
    if (rawName.startsWith('/') || /^[A-Za-z]:/.test(rawName)) return { ok: false, code: 'import.unsafe', error: `压缩包里有绝对路径：${rawName}` }
    const clean = normalize(rawName).replace(/\\/g, '/')
    if (clean.startsWith('..') || clean.split('/').includes('..')) return { ok: false, code: 'import.unsafe', error: `压缩包里有越界路径：${rawName}` }
    entries.set(clean, bytes)
  }

  const skillFiles = [...entries.keys()].filter((key) => key === 'SKILL.md' || key.endsWith('/SKILL.md'))
  if (skillFiles.length === 0) return { ok: false, code: 'import.noskill', error: '压缩包里没有 SKILL.md' }

  // 取层级最浅的那个 SKILL.md 作为技能根。
  skillFiles.sort((a, b) => a.split('/').length - b.split('/').length)
  const rootFile = skillFiles[0]
  const prefix = rootFile.includes('/') ? `${rootFile.slice(0, rootFile.lastIndexOf('/'))}/` : ''
  const wrapper = prefix ? prefix.split('/').filter(Boolean).pop() : ''

  const parsed = parseSkill(Buffer.from(entries.get(rootFile)).toString('utf8'))
  const heading = /^#\s+(.+)$/m.exec(parsed.body)?.[1]?.trim()
  const name = toSkillSlug(input.name || parsed.attributes.name || parsed.attributes.slug || wrapper || heading)
  const checked = writable(input.root, name)
  if (!checked.ok) return checked

  const target = skillDir(checked.root, name)
  if (existsSync(target)) return { ok: false, code: 'skill.exists', error: `技能 ${name} 已存在，未覆盖` }

  mkdirSync(target, { recursive: true })
  for (const [key, bytes] of entries) {
    if (prefix && !key.startsWith(prefix)) continue
    const rel = prefix ? key.slice(prefix.length) : key
    if (!rel) continue
    const destination = join(target, rel)
    const escaped = relative(target, destination)
    if (escaped.startsWith('..') || isAbsolute(escaped)) return { ok: false, code: 'import.unsafe', error: `拒绝写入越界文件：${rel}` }
    mkdirSync(join(destination, '..'), { recursive: true })
    writeFileSync(destination, Buffer.from(bytes))
  }
  return { ok: true, name, path: join(target, 'SKILL.md') }
}
