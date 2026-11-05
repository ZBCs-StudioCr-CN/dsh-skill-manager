/** 偏好存储：$DSH_HOME/skill-manager/preferences.json，只存用户显式决定，不缓存磁盘推导结果。 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** 空偏好。 */
export function emptyPreferences() {
  return { version: 2, disabled: [], defaultLoaded: [], defaultScopes: [], categories: [], showAiSuggestions: true }
}

/**
 * 偏好文件路径。
 * @param {string} dshHome - DSH 配置根
 * @returns {string} 绝对路径
 */
export function preferencesPath(dshHome) {
  return join(dshHome, 'skill-manager', 'preferences.json')
}

/**
 * 把任意读入值收敛成合法偏好。
 * @param {unknown} value - 读入值
 * @returns {{ version: number, disabled: string[], defaultLoaded: string[], defaultScopes: Array<{id: string, kind: string, target: string, skills: string[]}>, categories: Array<{id: string, name: string, keywords: string[], skills: string[]}> }} 偏好
 */
export function normalizePreferences(value) {
  const source = value && typeof value === 'object' ? value : {}
  const strings = (list) => (Array.isArray(list) ? [...new Set(list.filter((item) => typeof item === 'string' && item.trim()))] : [])
  const categories = Array.isArray(source.categories)
    ? source.categories
        .filter((item) => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.name === 'string')
        .map((item) => ({
          id: item.id,
          name: item.name,
          keywords: strings(item.keywords),
          skills: strings(item.skills),
          ...(item.auto === true ? { auto: true } : {}),
        }))
    : []
  const defaultScopes = Array.isArray(source.defaultScopes)
    ? source.defaultScopes
        .filter((item) => item && typeof item === 'object' && typeof item.target === 'string' && item.target.trim())
        .map((item) => ({
          id: typeof item.id === 'string' && item.id ? item.id : `${item.kind === 'preset' ? 'preset' : 'project'}:${item.target}`,
          kind: item.kind === 'preset' ? 'preset' : 'project',
          target: item.target.trim(),
          skills: strings(item.skills),
        }))
        .filter((item) => item.skills.length > 0)
    : []
  return {
    version: 2,
    disabled: strings(source.disabled),
    defaultLoaded: strings(source.defaultLoaded),
    defaultScopes,
    categories,
    // 界面开关：默认打开「显示 AI 建议」。
    showAiSuggestions: source.showAiSuggestions !== false,
  }
}

/**
 * 读取偏好；文件缺失或损坏时返回空偏好，并把损坏情况报告给调用方。
 * @param {string} dshHome - DSH 配置根
 * @returns {{ preferences: ReturnType<typeof emptyPreferences>, path: string, damaged: boolean, reason?: string }} 读取结果
 */
export function loadPreferences(dshHome) {
  const path = preferencesPath(dshHome)
  try {
    const raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '')
    return { preferences: normalizePreferences(JSON.parse(raw)), path, damaged: false }
  } catch (error) {
    const missing = error && error.code === 'ENOENT'
    return { preferences: emptyPreferences(), path, damaged: !missing, reason: missing ? undefined : String(error && error.message) }
  }
}

/**
 * 原子写入偏好。
 * @param {string} dshHome - DSH 配置根
 * @param {object} preferences - 要写入的偏好
 * @returns {string} 写入路径
 */
export function savePreferences(dshHome, preferences) {
  const path = preferencesPath(dshHome)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  // 不带 BOM：带 BOM 的 JSON 会让下一次读取的 JSON.parse 直接失败。
  writeFileSync(temporary, `${JSON.stringify(normalizePreferences(preferences), null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
  return path
}
