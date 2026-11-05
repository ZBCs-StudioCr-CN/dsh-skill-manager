/** 让模型按「产品 / 项目生命周期阶段」理解技能并分组，而不是按字面相同词归类。 */

import { extractJson, streamText } from './model.js'

/** 分类数上限，避免模型把每个技能都单开一类。 */
const MAX_CATEGORIES = 8

/** 固定的阶段清单：让模型在已知阶段里挑，而不是自创类名。 */
export const STAGES = ['需求分析', '商业论证', '方案设计', '原型美工', '开发实现', '测试验收', '上线部署', '运营增长', '成本优化', '协作管理', '其他']

/**
 * 把技能整理成给模型看的清单（正文只取摘录，控制 token）。
 * @param {Array<{ name: string, description?: string, body?: string }>} skills - 技能
 * @returns {string} JSON 清单
 */
function buildSkillList(skills) {
  const rows = skills.map((skill) => ({
    name: skill.name,
    description: String(skill.description ?? '').slice(0, 120),
    excerpt: String(skill.body ?? '').replace(/\s+/g, ' ').slice(0, 320),
  }))
  return JSON.stringify(rows, null, 1)
}

/**
 * 修一个稳定的分类 id。
 * @param {string} name - 分类名
 * @param {number} index - 序号
 * @returns {string} id
 */
function categoryId(name, index) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (slug) return slug
  let hash = 2166136261
  for (let cursor = 0; cursor < name.length; cursor += 1) {
    hash ^= name.charCodeAt(cursor)
    hash = Math.imul(hash, 16777619)
  }
  return `stage-${(hash >>> 0).toString(16).slice(0, 6)}-${index}`
}

/** 每批发给模型的技能数：一次塞太多，模型容易返回空文本。 */
const BATCH_SIZE = 12

/**
 * 调模型做阶段分类；技能多时分批，再按阶段名合并。
 * @param {object} options - 参数
 * @param {object|undefined} options.llm - ctx.llm
 * @param {{ provider: string, model: string }} options.route - 模型路由
 * @param {Array<{ name: string, description?: string, body?: string }>} options.skills - 待归类技能
 * @param {AbortSignal} [options.signal] - 取消信号
 * @returns {Promise<{ ok: boolean, source: 'llm', categories?: Array<{id: string, name: string, keywords: string[], skills: string[]}>, error?: string }>} 结果
 */
export async function classifyWithModel({ llm, route, skills, signal }) {
  if (!Array.isArray(skills) || skills.length === 0) return { ok: false, source: 'llm', error: '没有待归类的技能' }

  const merged = new Map()
  for (let offset = 0; offset < skills.length; offset += BATCH_SIZE) {
    const batch = skills.slice(offset, offset + BATCH_SIZE)
    const one = await classifyBatch({ llm, route, skills: batch, signal })
    if (!one.ok) return one
    for (const category of one.categories) {
      const existing = merged.get(category.name)
      if (existing) existing.skills.push(...category.skills)
      else merged.set(category.name, { ...category, skills: [...category.skills] })
    }
  }

  const categories = [...merged.values()].slice(0, MAX_CATEGORIES)
  if (categories.length === 0) return { ok: false, source: 'llm', error: '模型没有给出可用的分类' }
  return { ok: true, source: 'llm', categories }
}

/**
 * 调一次模型，给一批技能分类。
 * @param {object} options - 参数
 * @returns {Promise<{ ok: boolean, source: 'llm', categories?: Array<object>, error?: string }>} 结果
 */
async function classifyBatch({ llm, route, skills, signal }) {
  const system = [
    '你是产品与研发流程专家。你的任务是把 agent 技能按「产品 / 项目生命周期阶段」理解后归类，',
    '不是按字面相同的词归类。',
  ].join('')
  const user = [
    '下面是一批 agent 技能（名称 / 原描述 / 正文摘录）。请判断每个技能在**工作流程的哪个阶段**起作用。',
    '',
    '只能使用下面这些阶段名，不要自创英文类名，也不要用技能名当分类名：',
    STAGES.join('、'),
    '',
    '判断提示：压缩上下文 / 节约 token / 降本 → 成本优化；测试用例、验收 → 测试验收；',
    '发布、部署、运维 → 上线部署；会议、站会、排期、评审 → 协作管理；画图、配色、界面 → 原型美工。',
    '',
    '规则：',
    '1. 每个技能只进一个阶段；同一个阶段可以放多个技能；',
    `2. 最多输出 ${MAX_CATEGORIES} 个阶段（只输出确实有技能的阶段）；`,
    '3. 实在判断不出的技能放进「其他」；',
    '4. 只输出 JSON，格式：{"categories":[{"name":"需求分析","skills":["skill-a","skill-b"]}]}',
    '',
    '技能清单：',
    buildSkillList(skills),
  ].join('\n')

  // 小模型偶尔返回空文本或半截 JSON；同一份输入重试一次通常就好。
  let text = ''
  let parsed
  for (let attempt = 0; attempt < 2 && !parsed; attempt += 1) {
    text = await streamText({ llm, route, system, user, maxTokens: 1600, timeoutMs: 60_000, signal })
    const candidate = extractJson(text)
    if (candidate && Array.isArray(candidate.categories)) parsed = candidate
  }
  if (!parsed) {
    return { ok: false, source: 'llm', error: `模型返回里没有分类 JSON：${text.slice(0, 120)}` }
  }

  const known = new Set(skills.map((skill) => skill.name))
  const seen = new Set()
  const categories = []
  for (const [index, raw] of parsed.categories.entries()) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) continue
    // 只认中文阶段名：模型偶尔会自创 decision/application 这类英文类名，一律并进「其他」。
    const rawName = raw.name.trim()
    const name = (/[\u4e00-\u9fff]/.test(rawName) ? rawName : '其他').slice(0, 8)
    const members = Array.isArray(raw.skills)
      ? raw.skills.filter((item) => typeof item === 'string' && known.has(item) && !seen.has(item))
      : []
    if (members.length === 0) continue
    for (const member of members) seen.add(member)
    categories.push({ id: categoryId(name, index + categories.length), name, keywords: [], skills: members })
    if (categories.length >= MAX_CATEGORIES) break
  }
  if (categories.length === 0) return { ok: false, source: 'llm', error: '模型没有给出可用的分类' }
  return { ok: true, source: 'llm', categories }
}
