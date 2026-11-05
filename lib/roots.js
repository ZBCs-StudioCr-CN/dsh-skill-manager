/** 技能根目录解析：与 dsh-skill-filesystem 的默认根保持同一套 rank/来源名。 */

import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/** 与 dsh-skill-filesystem 对齐的来源名。 */
export const SOURCES = {
  projectDsh: 'project-dsh',
  projectAgents: 'project-agents',
  custom: 'custom',
  userDsh: 'user-dsh',
  userAgents: 'user-agents',
  bundled: 'bundled',
}

/**
 * DSH 配置根。
 * @returns {string} 绝对路径
 */
export function resolveDshHome() {
  const env = process.env.DSH_HOME
  return env && env.trim() ? resolve(env.trim()) : join(homedir(), '.dsh')
}

/**
 * 共享 agent 配置根。
 * @returns {string} 绝对路径
 */
export function resolveAgentsHome() {
  const env = process.env.DSH_AGENTS_HOME
  return env && env.trim() ? resolve(env.trim()) : join(homedir(), '.agents')
}

/**
 * 找到包含 .git 的最近祖先目录，作为「项目根」。
 * @param {string} start - 起始目录
 * @returns {string} 项目根（找不到时退回起始目录）
 */
export function repoRoot(start) {
  let current = resolve(start)
  for (;;) {
    if (existsSync(join(current, '.git'))) return current
    const parent = dirname(current)
    if (parent === current) return resolve(start)
    current = parent
  }
}

/**
 * 列出某个工作目录下 DSH 会读取的技能根，按 rank 升序。
 * @param {{ cwd?: string, config?: object }} options - 查询参数
 * @returns {Array<{ key: string, source: string, rank: number, path: string, readOnly?: boolean }>} 根列表
 */
export function listRoots({ cwd, config = {} } = {}) {
  const root = repoRoot(cwd && cwd.trim() ? cwd : process.cwd())
  const roots = [
    { key: 'project-dsh', source: SOURCES.projectDsh, rank: 100, path: join(root, '.dsh', 'skills') },
    { key: 'project-agents', source: SOURCES.projectAgents, rank: 200, path: join(root, '.agents', 'skills') },
  ]
  for (const [index, dir] of (config.customSkillDirs ?? []).entries()) {
    roots.push({ key: `custom-${index}`, source: SOURCES.custom, rank: 300 + index, path: resolve(dir) })
  }
  roots.push({ key: 'user-dsh', source: SOURCES.userDsh, rank: 400, path: join(config.dshHome ?? resolveDshHome(), 'skills') })
  roots.push({ key: 'user-agents', source: SOURCES.userAgents, rank: 500, path: join(config.agentsHome ?? resolveAgentsHome(), 'skills') })
  const bundled = config.bundledSkillDir ?? process.env.DSH_BUNDLED_SKILL_DIR
  if (bundled && bundled.trim()) {
    roots.push({ key: 'bundled', source: SOURCES.bundled, rank: 600, path: resolve(bundled.trim()), readOnly: true })
  }
  return roots.filter((item) => config.includeDefaultRoots !== false || item.rank >= 300)
}
