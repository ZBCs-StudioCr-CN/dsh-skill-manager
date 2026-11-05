/** rank 0 覆盖提供方：只对被显式停用的技能发出候选，从而在注册表里赢得同名裁决。 */

import { readdirSync } from 'node:fs'

import { readSkillFile } from './catalog.js'

/** 提供方名称。 */
export const PROVIDER_NAME = 'skill-manager'

/**
 * 创建一个覆盖提供方。
 * @param {{ rootsFor: (cwd?: string) => Array<object>, isDisabled: (name: string) => boolean }} deps - 依赖
 * @returns {object} SkillProvider
 */
export function createProvider({ rootsFor, isDisabled }) {
  return {
    name: PROVIDER_NAME,
    /**
     * 只为被停用的技能发出候选：rank 0 低于文件系统提供方的 100–600，
     * 因此这些名字的裁决必然被我们赢得，策略也就生效了。
     * @param {{ cwd?: string }} options - 查询参数
     * @returns {Promise<Array<object>>} 候选
     */
    async list(options) {
      if (options?.signal?.aborted) return []
      const candidates = []
      for (const root of rootsFor(options?.cwd)) {
        let names = []
        try {
          names = readdirSync(root.path, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
        } catch {
          continue
        }
        for (const name of names) {
          if (!isDisabled(name)) continue
          const file = readSkillFile(root.path, name)
          if (!file) continue
          candidates.push({
            name,
            description: String(file.parsed.attributes.description ?? '').trim(),
            invocation: { modelInvocable: false, userInvocable: false },
            source: root.source,
            provider: PROVIDER_NAME,
            rank: 0,
            path: file.path,
            locator: { root: root.path, name, source: root.source },
          })
        }
      }
      return candidates
    },
    /**
     * 读回真实正文，供「已停用但仍可查看」的场景使用。
     * @param {object} candidate - 候选
     * @returns {Promise<object|undefined>} 技能定义
     */
    async get(candidate) {
      const locator = candidate?.locator
      if (!locator || typeof locator.root !== 'string') return undefined
      const file = readSkillFile(locator.root, locator.name)
      if (!file) return undefined
      return {
        name: locator.name,
        description: String(file.parsed.attributes.description ?? '').trim(),
        whenToUse: String(file.parsed.attributes['when-to-use'] ?? '').trim() || undefined,
        content: file.parsed.body,
        path: file.path,
        source: locator.source,
        provider: PROVIDER_NAME,
        invocation: { modelInvocable: false, userInvocable: false },
      }
    },
  }
}
