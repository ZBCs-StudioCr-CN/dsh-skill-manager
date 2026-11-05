/** SKILL.md 的 YAML frontmatter 读写：只覆盖 skill 实际用到的键，其余原样保留。 */

/** 由本管理器管理的 frontmatter 键。 */
const MANAGED = new Set(['name', 'description', 'when-to-use', 'when_to_use', 'disable-model-invocation', 'user-invocable'])

/**
 * 去掉包裹引号。
 * @param {string} value - 原始值
 * @returns {string} 去引号后的值
 */
function unquote(value) {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * 解析 SKILL.md：frontmatter + 正文。
 * @param {string} source - 文件内容
 * @returns {{ attributes: Record<string, string>, body: string, hasFrontmatter: boolean }} 解析结果
 */
export function parseSkill(source) {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!text.startsWith('---\n')) return { attributes: {}, body: text, hasFrontmatter: false }
  const end = text.indexOf('\n---', 4)
  if (end === -1) return { attributes: {}, body: text, hasFrontmatter: false }
  const block = text.slice(4, end)
  const attributes = {}
  let lastKey
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const indented = /^\s+\S/.test(rawLine)
    if (indented && lastKey) {
      attributes[lastKey] = `${attributes[lastKey]} ${line.trim()}`.trim()
      continue
    }
    const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    lastKey = match[1]
    attributes[lastKey] = unquote(match[2])
  }
  const bodyStart = text.indexOf('\n', end + 4)
  return { attributes, body: bodyStart === -1 ? '' : text.slice(bodyStart + 1), hasFrontmatter: true }
}

/**
 * 把属性与正文写回 SKILL.md，未托管的键保持原有顺序与内容。
 * @param {{ attributes: Record<string, string>, body: string, hasFrontmatter: boolean }} parsed - 原文件解析结果
 * @param {{ name: string, description: string, whenToUse?: string, disableModelInvocation?: boolean, userInvocable?: boolean }} skill - 期望值
 * @returns {string} 新文件内容
 */
export function serializeSkill(parsed, skill) {
  const lines = []
  const attributes = parsed.attributes ?? {}
  const push = (key, value) => {
    if (value === undefined || value === null || value === '') return
    lines.push(`${key}: ${JSON.stringify(String(value))}`)
  }
  push('name', skill.name)
  push('description', skill.description)
  push('when-to-use', skill.whenToUse)
  if (skill.disableModelInvocation) lines.push('disable-model-invocation: true')
  if (skill.userInvocable) lines.push('user-invocable: true')
  for (const [key, value] of Object.entries(attributes)) {
    if (MANAGED.has(key)) continue
    lines.push(`${key}: ${JSON.stringify(String(value))}`)
  }
  const body = (skill.body ?? parsed.body ?? '').replace(/^\n+/, '').replace(/\s+$/, '')
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`
}

/**
 * 判断 frontmatter 里是否显式关闭了模型调用。
 * @param {Record<string, string>} attributes - frontmatter 属性
 * @returns {boolean} 是否关闭
 */
export function modelDisabled(attributes) {
  return String(attributes['disable-model-invocation'] ?? '').toLowerCase() === 'true'
}

/**
 * 判断 frontmatter 里是否允许用户调用。
 * @param {Record<string, string>} attributes - frontmatter 属性
 * @returns {boolean} 是否允许
 */
export function userInvocable(attributes) {
  return String(attributes['user-invocable'] ?? '').toLowerCase() === 'true'
}
