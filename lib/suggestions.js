/** AI 描述建议的旁路存储：只存建议，绝不写回 SKILL.md，除非用户显式采纳。 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * 建议文件路径。
 * @param {string} dshHome - DSH 配置根
 * @returns {string} 绝对路径
 */
export function suggestionsPath(dshHome) {
  return join(dshHome, 'skill-manager', 'suggestions.json')
}

/**
 * 算一份技能内容的短指纹，用来判断建议是否还对应得上当前文件。
 * @param {string} content - SKILL.md 全文
 * @returns {string} 指纹
 */
export function contentHash(content) {
  return createHash('sha1').update(String(content)).digest('hex').slice(0, 12)
}

/**
 * 读建议表；文件缺失或损坏都按空表处理。
 * @param {string} dshHome - DSH 配置根
 * @returns {{ version: number, entries: Record<string, object> }} 建议表
 */
export function loadSuggestions(dshHome) {
  try {
    const raw = readFileSync(suggestionsPath(dshHome), 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(raw)
    const entries = parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {}
    return { version: 1, entries }
  } catch {
    return { version: 1, entries: {} }
  }
}

/**
 * 写建议表。
 * @param {string} dshHome - DSH 配置根
 * @param {{ version: number, entries: Record<string, object> }} table - 建议表
 * @returns {string} 写入路径
 */
export function saveSuggestions(dshHome, table) {
  const path = suggestionsPath(dshHome)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(table, null, 2)}\n`, 'utf8')
  renameSync(temporary, path)
  return path
}

/**
 * 记下一条建议。
 * @param {string} dshHome - DSH 配置根
 * @param {{ name: string, hash: string, description?: string, whenToUse?: string, category?: string, source: string, lang: string, error?: string }} suggestion - 建议
 * @returns {object} 建议表
 */
export function putSuggestion(dshHome, suggestion) {
  const table = loadSuggestions(dshHome)
  table.entries[suggestion.name] = {
    name: suggestion.name,
    hash: suggestion.hash,
    description: suggestion.description,
    whenToUse: suggestion.whenToUse,
    category: suggestion.category,
    source: suggestion.source,
    lang: suggestion.lang,
    error: suggestion.error,
    at: new Date().toISOString(),
  }
  saveSuggestions(dshHome, table)
  return table
}

/**
 * 删掉一条建议。
 * @param {string} dshHome - DSH 配置根
 * @param {string} name - 技能名
 * @returns {object} 建议表
 */
export function dropSuggestion(dshHome, name) {
  const table = loadSuggestions(dshHome)
  delete table.entries[name]
  saveSuggestions(dshHome, table)
  return table
}
