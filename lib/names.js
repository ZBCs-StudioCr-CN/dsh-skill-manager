/** 技能名校验：与 dsh-skill 的公开语法一致（kebab-case）。 */

const PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * 判断是否为合法技能名。
 * @param {string} name - 候选名
 * @returns {boolean} 是否合法
 */
export function isSkillName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 && PATTERN.test(name)
}
