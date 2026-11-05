/** 技能目录扫描：按根目录收集 SKILL.md，解析 frontmatter，并处理同名遮蔽。 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { modelDisabled, parseSkill, userInvocable } from './frontmatter.js'
import { isSkillName } from './names.js'

/**
 * 列出一个根目录下的技能目录名。
 * @param {string} root - 技能根
 * @returns {string[]} 技能目录名
 */
export function listSkillNames(root) {
  try {
    return readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isSkillName(entry.name))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * 读取一个技能的 SKILL.md。
 * @param {string} root - 技能根
 * @param {string} name - 技能名（目录名）
 * @returns {{ path: string, source: string, parsed: ReturnType<typeof parseSkill> } | undefined} 读取结果
 */
export function readSkillFile(root, name) {
  const path = join(root, name, 'SKILL.md')
  try {
    if (!statSync(path).isFile()) return undefined
    const source = readFileSync(path, 'utf8')
    return { path, source, parsed: parseSkill(source) }
  } catch {
    return undefined
  }
}

/**
 * 扫描所有根，返回按 rank 去重后的技能清单。
 * @param {Array<{ key: string, source: string, rank: number, path: string, readOnly?: boolean }>} roots - 根列表
 * @returns {{ skills: Array<object>, shadowed: Array<object> }} 清单与遮蔽记录
 */
export function listSkills(roots) {
  const winners = new Map()
  const shadowed = []
  for (const root of [...roots].sort((a, b) => a.rank - b.rank)) {
    if (!existsSync(root.path)) continue
    for (const name of listSkillNames(root.path)) {
      const file = readSkillFile(root.path, name)
      if (!file) continue
      const attributes = file.parsed.attributes
      const entry = {
        name,
        description: String(attributes.description ?? '').trim(),
        whenToUse: String(attributes['when-to-use'] ?? attributes.when_to_use ?? '').trim(),
        path: file.path,
        rootKey: root.key,
        source: root.source,
        rank: root.rank,
        readOnly: root.readOnly === true,
        modelInvocable: !modelDisabled(attributes),
        userInvocable: userInvocable(attributes) || !modelDisabled(attributes),
      }
      const winner = winners.get(name)
      if (winner) {
        shadowed.push({ ...entry, shadowedBy: winner.rootKey })
        continue
      }
      winners.set(name, entry)
    }
  }
  return {
    skills: [...winners.values()].sort((a, b) => a.name.localeCompare(b.name)),
    shadowed: shadowed.sort((a, b) => a.name.localeCompare(b.name)),
  }
}
