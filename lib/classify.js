/** 关键词智能归类：本地规则、可解释、无需 API key。 */

/** 首次使用时自动建立的默认分类。 */
export const DEFAULT_CATEGORIES = [
  { id: 'design', name: '设计', keywords: ['设计', 'ui', 'ux', '界面', '交互', '视觉', '样式', 'design', 'figma', '原型'] },
  { id: 'competitor-analysis', name: '竞品分析', keywords: ['竞品', '竞争对手', '对标', 'competitor', '对比', '调研', 'benchmark'] },
  { id: 'market-analysis', name: '市场分析', keywords: ['获客', '渠道', '漏斗', '转化', '市场', '增长', '营销', 'roi', 'acquisition', 'funnel', '留存', '激活', '用户', 'market'] },
  { id: 'planning', name: '项目规划', keywords: ['规划', '排期', '计划', 'sprint', 'roadmap', 'backlog', '迭代', '里程碑', 'planning', '立项'] },
  { id: 'development', name: '开发', keywords: ['开发', '代码', 'api', '后端', '前端', '架构', '生成', '实现', 'backend', 'frontend', '工程', '构建', 'debug', '重构'] },
  { id: 'operations', name: '运营', keywords: ['运营', '同步', '日报', '周报', '评审', '回顾', 'onboarding', '社区', '内容', '活动', '站会', '增长'] },
]

/**
 * 把分类名转成稳定的 kebab-case id。
 * @param {string} name - 分类名
 * @returns {string} id
 */
export function toCategoryId(name) {
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return id.length > 0 ? id : `category-${Date.now().toString(36)}`
}

/**
 * 给一个技能打分归类：名字命中权重高于描述，命中多个关键词累加。
 * @param {{ name: string, description?: string, whenToUse?: string }} skill - 技能
 * @param {Array<{ id: string, name: string, keywords?: string[] }>} categories - 候选分类
 * @returns {{ categoryId: string, score: number, matched: string[] } | undefined} 命中最高的分类
 */
export function classifySkill(skill, categories) {
  const haystacks = [
    { text: String(skill.name ?? '').toLowerCase(), weight: 3 },
    { text: `${skill.description ?? ''} ${skill.whenToUse ?? ''}`.toLowerCase(), weight: 1 },
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
 * @param {Array<{ name: string, description?: string, whenToUse?: string }>} skills - 技能列表
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
