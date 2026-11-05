/** 关键词智能归类：读正文、可解释、本地运行，并能自动攒出新分类。 */

/** 首次使用时自动建立的默认分类。 */
export const DEFAULT_CATEGORIES = [
  { id: 'design', name: '设计', keywords: ['设计', 'ui', 'ux', '界面', '交互', '视觉', '样式', 'design', 'figma', '原型'] },
  { id: 'competitor-analysis', name: '竞品分析', keywords: ['竞品', '竞争对手', '对标', 'competitor', '对比', '调研', 'benchmark'] },
  { id: 'market-analysis', name: '市场分析', keywords: ['获客', '渠道', '漏斗', '转化', '市场', '增长', '营销', 'roi', 'acquisition', 'funnel', '留存', '激活', '用户', 'market'] },
  { id: 'planning', name: '项目规划', keywords: ['规划', '排期', '计划', 'sprint', 'roadmap', 'backlog', '迭代', '里程碑', 'planning', '立项'] },
  { id: 'development', name: '开发', keywords: ['开发', '代码', 'api', '后端', '前端', '架构', '生成', '实现', 'backend', 'frontend', '工程', '构建', 'debug', '重构'] },
  { id: 'operations', name: '运营', keywords: ['运营', '同步', '日报', '周报', '评审', '回顾', 'onboarding', '社区', '内容', '活动', '站会', '增长'] },
]

/** 自动分组的兜底分类名。 */
export const FALLBACK_CATEGORY = { id: 'other', name: '其他', keywords: [] }

/**
 * 短哈希，用来给纯中文分类生成稳定的 id。
 * @param {string} value - 输入
 * @returns {string} 6 位十六进制
 */
function shortHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 6)
}

/**
 * 判断一个候选词是否已被用掉（与已有分类名互为子串就跳过，避免「转化」和「转化率」并存）。
 * @param {string} token - 候选词
 * @param {Array<{ name: string }>} categories - 现有分类
 * @returns {boolean} 是否重复
 */
function usedName(token, categories) {
  return categories.some((category) => {
    const name = String(category.name).toLowerCase()
    return name === token || name.includes(token) || token.includes(name)
  })
}

/** 切词时忽略的高频英文词。 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'are', 'was', 'will', 'can', 'not', 'use', 'when',
  'what', 'how', 'why', 'from', 'into', 'them', 'they', 'have', 'has', 'had', 'but', 'all', 'any', 'our', 'out',
  'skill', 'skills', 'agent', 'user', 'users', 'file', 'files', 'should', 'must', 'may', 'also', 'such', 'then',
  'output', 'input', 'result', 'results', 'value', 'values', 'data', 'text', 'content', 'number', 'string', 'example',
  'json', 'yaml', 'markdown', 'html', 'internally', 'using', 'based', 'below', 'above', 'only', 'more', 'less', 'same',
  'generated', 'generate', 'provide', 'provides', 'include', 'includes', 'following', 'defined', 'default', 'returns',
])

/**
 * 把分类名转成稳定的 kebab-case id。
 * @param {string} name - 分类名
 * @returns {string} id
 */
export function toCategoryId(name) {
  const id = String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return id.length > 0 ? id : `category-${Date.now().toString(36)}`
}

/** 中文片段里不该开头的虚词，用来避免「的转化率」这类分类名。 */
const CJK_EDGE = /^[的了和与及在是有对把被让从并且或者其之]+|[的了和与及在是有对把被让从并且或者其之]+$/

/**
 * 从一段文本里抽出候选词：英文单词 + 中文 2–4 字片段（去掉虚词起止的片段）。
 * @param {string} text - 文本
 * @returns {string[]} 候选词
 */
export function tokenize(text) {
  const lower = String(text ?? '').toLowerCase()
  const tokens = []
  for (const word of lower.match(/[a-z][a-z0-9]{4,}/g) ?? []) {
    if (!STOPWORDS.has(word)) tokens.push(word)
  }
  for (const run of lower.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let size = 2; size <= Math.min(4, run.length); size += 1) {
      for (let index = 0; index + size <= run.length; index += 1) {
        const piece = run.slice(index, index + size)
        if (CJK_EDGE.test(piece)) continue
        tokens.push(piece)
      }
    }
  }
  return tokens
}

/**
 * 给一个技能打分归类：名字命中权重最高，描述次之，正文最低。
 * @param {{ name: string, description?: string, whenToUse?: string, body?: string }} skill - 技能
 * @param {Array<{ id: string, name: string, keywords?: string[] }>} categories - 候选分类
 * @returns {{ categoryId: string, score: number, matched: string[] } | undefined} 命中最高的分类
 */
export function classifySkill(skill, categories) {
  const haystacks = [
    { text: String(skill.name ?? '').toLowerCase(), weight: 3 },
    { text: `${skill.description ?? ''} ${skill.whenToUse ?? ''}`.toLowerCase(), weight: 2 },
    { text: String(skill.body ?? '').toLowerCase(), weight: 1 },
  ]
  let best
  for (const category of categories) {
    const keywords = [...new Set([category.name, ...(category.keywords ?? [])].map((word) => String(word).toLowerCase().trim()).filter(Boolean))]
    let score = 0
    const matched = []
    for (const keyword of keywords) {
      for (const haystack of haystacks) {
        if (haystack.text.includes(keyword)) {
          score += haystack.weight + Math.min(keyword.length, 8) / 8
          matched.push(keyword)
          break
        }
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { categoryId: category.id, score, matched: [...new Set(matched)] }
  }
  return best
}

/**
 * 为一组技能生成归类建议；已有分类归属的技能保持不动。
 * @param {Array<{ name: string, description?: string, whenToUse?: string, body?: string }>} skills - 技能列表
 * @param {Array<{ id: string, name: string, keywords?: string[], skills?: string[] }>} categories - 分类
 * @returns {Array<{ skill: string, categoryId: string | null, score: number, matched: string[] }>} 建议
 */
export function suggestCategories(skills, categories) {
  const assigned = new Set(categories.flatMap((category) => category.skills ?? []))
  return skills.map((skill) => {
    if (assigned.has(skill.name)) return { skill: skill.name, categoryId: null, score: 0, matched: [] }
    const best = classifySkill(skill, categories)
    return { skill: skill.name, categoryId: best?.categoryId ?? null, score: best?.score ?? 0, matched: best?.matched ?? [] }
  })
}

/**
 * 读正文后整理分类：先用现有分类打分，剩下的按正文高频词自动攒出新分类。
 *
 * 这是「不用人工先建分类」的关键：没有现成分类可用时，它会从技能正文里挑出
 * 出现频次最高的词作为分类名，一组至少两个技能才成组，余下的落进「其他」。
 * @param {Array<{ name: string, description?: string, whenToUse?: string, body?: string }>} skills - 技能（带正文）
 * @param {Array<{ id: string, name: string, keywords?: string[], skills?: string[] }>} categories - 现有分类
 * @param {{ allowCreate?: boolean, maxCreated?: number }} [options] - 选项
 * @returns {{ categories: Array<object>, assignments: Array<{ skill: string, categoryId: string }>, created: string[] }} 结果
 */
export function proposeCategories(skills, categories, options = {}) {
  const allowCreate = options.allowCreate !== false
  const maxCreated = options.maxCreated ?? 6
  const next = categories.map((category) => ({ ...category, keywords: [...(category.keywords ?? [])], skills: [...(category.skills ?? [])] }))
  const assignments = []
  const created = []
  const assigned = new Set(next.flatMap((category) => category.skills))

  for (const skill of skills) {
    if (assigned.has(skill.name)) continue
    const best = classifySkill(skill, next)
    if (!best) continue
    const category = next.find((item) => item.id === best.categoryId)
    if (!category) continue
    category.skills.push(skill.name)
    assigned.add(skill.name)
    assignments.push({ skill: skill.name, categoryId: category.id })
  }

  if (!allowCreate) return { categories: next, assignments, created }

  // 按正文词频给剩下的技能自动成组。
  const pool = skills.filter((skill) => !assigned.has(skill.name) && String(skill.body ?? '').trim())
  const freq = new Map()
  for (const skill of pool) {
    for (const token of new Set(tokenize(skill.body))) {
      const entry = freq.get(token) ?? { count: 0, skills: new Set() }
      entry.count += 1
      entry.skills.add(skill.name)
      freq.set(token, entry)
    }
  }

  while (pool.length >= 2 && created.length < maxCreated) {
    let best
    const skillNames = new Set(skills.map((skill) => skill.name.toLowerCase()))
    for (const [token, entry] of freq) {
      // 不要把技能名本身变成分类名。
      if (skillNames.has(token)) continue
      const size = [...entry.skills].filter((name) => pool.some((skill) => skill.name === name)).length
      if (size < 2) continue
      // 覆盖数优先；同覆盖下更长的词更像分类名（「转化率」优于「转化」），中文再给一点偏好。
      const score = size * 10 + token.length + (/[\u4e00-\u9fff]/.test(token) ? 3 : 0)
      if (!best || score > best.score) best = { token, size, score }
    }
    if (!best) break

    const members = pool.filter((skill) => tokenize(skill.body).includes(best.token))
    if (members.length < 2 || usedName(best.token, next)) {
      freq.delete(best.token)
      continue
    }
    const slug = String(best.token).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const id = slug.length > 0 ? slug : `c-${shortHash(best.token)}`
    if (next.some((category) => category.id === id)) {
      freq.delete(best.token)
      continue
    }
    next.push({ id, name: best.token, keywords: [best.token], skills: members.map((skill) => skill.name) })
    created.push(id)
    for (const member of members) {
      assigned.add(member.name)
      assignments.push({ skill: member.name, categoryId: id })
    }
    pool.splice(0, pool.length, ...pool.filter((skill) => !members.includes(skill)))
  }

  if (allowCreate && pool.length > 0) {
    let other = next.find((category) => category.id === FALLBACK_CATEGORY.id)
    if (!other) {
      other = { ...FALLBACK_CATEGORY, keywords: [], skills: [] }
      next.push(other)
      created.push(other.id)
    }
    for (const skill of pool) {
      other.skills.push(skill.name)
      assignments.push({ skill: skill.name, categoryId: other.id })
    }
  }

  return { categories: next, assignments, created }
}

/** 阶段关键词表：模型不可用时的确定性兜底，保证仍是「按阶段」而不是按字面词。 */
export const STAGE_KEYWORDS = [
  { name: '需求分析', keywords: ['需求', '调研', '访谈', '用户研究', '痛点', '场景', '用户画像', 'prd', '需求文档'] },
  { name: '商业论证', keywords: ['商业', '定价', '营收', '毛利', '成本', 'roi', '投入产出', '可行性', '商业模式', '预算'] },
  { name: '方案设计', keywords: ['方案', '架构', '系统设计', '技术选型', '流程设计', '规范', '接口设计', 'api 设计', 'schema'] },
  { name: '原型美工', keywords: ['原型', '设计稿', '界面', '视觉', '样式', 'ui', 'ux', 'figma', '图标', '配色'] },
  { name: '开发实现', keywords: ['开发', '编码', '代码', '实现', '接口', 'api', '后端', '前端', '脚本', '生成代码', '重构'] },
  { name: '测试验收', keywords: ['测试', '验收', '用例', '回归', '缺陷', 'bug', '质量'] },
  { name: '上线部署', keywords: ['上线', '部署', '发布', '灰度', '回滚', '运维', 'ci', 'cd'] },
  { name: '运营增长', keywords: ['运营', '获客', '增长', '渠道', '漏斗', '转化', '留存', '激活', '内容', '社区', '投放', '活动'] },
  { name: '成本优化', keywords: ['token', '成本', '压缩', '精简', '降本', '缓存', '性能', '预算', '省钱'] },
  { name: '协作管理', keywords: ['站会', '日报', '周报', '评审', '回顾', '排期', '计划', '协作', '管理', '会议', '纪要'] },
]

/**
 * 用阶段关键词表归类：模型不可用时的兜底，结果仍然是阶段而不是字面词。
 * @param {Array<{ name: string, description?: string, whenToUse?: string, body?: string }>} skills - 技能
 * @returns {{ categories: Array<{ id: string, name: string, keywords: string[], skills: string[], auto: boolean }> }} 结果
 */
export function classifyByStage(skills) {
  const buckets = new Map()
  for (const skill of skills) {
    const haystack = `${skill.name} ${skill.description ?? ''} ${skill.whenToUse ?? ''} ${String(skill.body ?? '').slice(0, 1200)}`.toLowerCase()
    let best
    for (const stage of STAGE_KEYWORDS) {
      let score = 0
      for (const keyword of stage.keywords) {
        if (haystack.includes(keyword.toLowerCase())) score += 1 + Math.min(keyword.length, 6) / 6
      }
      if (score > 0 && (!best || score > best.score)) best = { name: stage.name, score }
    }
    const name = best?.name ?? '其他'
    const list = buckets.get(name) ?? []
    list.push(skill.name)
    buckets.set(name, list)
  }

  const categories = []
  for (const [name, members] of buckets) {
    const stage = STAGE_KEYWORDS.find((item) => item.name === name)
    const id = name === '其他' ? 'other' : `stage-${(stage ? STAGE_KEYWORDS.indexOf(stage) + 1 : 0)}-${name.length}`
    categories.push({ id, name, keywords: stage ? [...stage.keywords] : [], skills: members, auto: true })
  }
  return { categories }
}
