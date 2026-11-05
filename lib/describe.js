/** 用宿主配置的模型做「描述翻译 / 用途推荐」；模型不可用时退回正文首段。 */

/**
 * 造一条最小的 user 消息。形状与 @deepseek-ai/dsh-llm 的 createUserMessage 一致，
 * 但不必为了它把 dsh-llm 变成硬依赖（缺失时也不该让插件加载失败）。
 * @param {string} text - 消息文本
 * @returns {object} 消息
 */
function userMessage(text) {
  return {
    id: `skill-manager-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text }],
  }
}

/**
 * 写给小模型的指令：只要 JSON，字段固定。
 * @param {{ name: string, description: string, whenToUse: string, body: string }} skill - 技能内容
 * @param {'zh' | 'en'} lang - 目标语言
 * @returns {string} prompt
 */
function buildPrompt(skill, lang) {
  const target = lang === 'en' ? 'English' : '中文'
  const truncated = skill.body.length > 4000 ? `${skill.body.slice(0, 4000)}\n…（正文已截断）` : skill.body
  return [
    '你在维护一个 agent skill 目录。下面是一个 SKILL.md 的内容。',
    '请输出**只有 JSON**，不要代码块、不要解释，字段如下：',
    `- description：一句话说明这个技能做什么，不超过 60 字，语言为${target}`,
    `- whenToUse：什么时候该用这个技能，不超过 40 字，语言为${target}`,
    '- category：一个 2–6 字的分类名（不要复用技能名）',
    `- translated：把原有的 description 翻译成${target}（原文已是${target}就原样返回）`,
    '',
    `技能名：${skill.name}`,
    `原描述：${skill.description || '（无）'}`,
    `原何时使用：${skill.whenToUse || '（无）'}`,
    '',
    '正文：',
    truncated,
  ].join('\n')
}

/**
 * 从模型输出里抠出 JSON 对象。
 * @param {string} text - 模型输出的文本
 * @returns {object | undefined} 解析结果
 */
export function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return undefined
  }
}

/**
 * 用正文首段做兜底建议。
 * @param {{ body: string, description: string }} skill - 技能
 * @returns {{ description: string, whenToUse: string, category: string }} 建议
 */
export function heuristicSuggestion(skill) {
  const clean = String(skill.body ?? '')
    .replace(/^#.*$/gm, '')
    .replace(/[`*_>#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sentence = clean.split(/[。.!?！？]/).map((part) => part.trim()).find((part) => part.length >= 6) ?? clean
  return {
    description: (sentence || skill.description || '').slice(0, 60),
    whenToUse: '',
    category: '',
  }
}

/**
 * 调模型给出描述 / 用途 / 分类建议。
 * @param {object} deps - 依赖
 * @param {object|undefined} deps.llm - ctx.llm
 * @param {{ provider: string, model: string }} deps.route - 模型路由
 * @param {{ name: string, description: string, whenToUse: string, body: string }} deps.skill - 技能
 * @param {'zh' | 'en'} deps.lang - 目标语言
 * @param {AbortSignal} [deps.signal] - 取消信号
 * @returns {Promise<{ ok: boolean, source: 'llm' | 'heuristic', description?: string, whenToUse?: string, category?: string, translated?: string, error?: string }>} 结果
 */
export async function describeSkill({ llm, route, skill, lang, signal }) {
  if (!llm || typeof llm.stream !== 'function') {
    const fallback = heuristicSuggestion(skill)
    return { ok: false, source: 'heuristic', ...fallback, error: '模型服务不可用，已用正文首段兜底' }
  }
  // 小模型偶尔会把 JSON 包在解释里或直接跑题；同一份输入重试一次通常就好。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await callModel({ llm, route, skill, lang, signal })
    if (result.ok) return result
    if (!/JSON/i.test(result.error ?? '')) return result
  }
  return { ok: false, source: 'heuristic', ...heuristicSuggestion(skill), error: '模型两次都没有返回可解析的 JSON，已用正文首段兜底' }
}

/**
 * 调一次模型并解析。
 * @param {object} input - 参数
 * @returns {Promise<object>} 结果
 */
async function callModel({ llm, route, skill, lang, signal }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const message = userMessage(buildPrompt(skill, lang))
    let text = ''
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: '你是一个只输出 JSON 的目录编辑助手。不要输出解释、不要 Markdown 代码块。',
      messages: [message],
      temperature: 0.1,
      maxTokens: 600,
      signal: controller.signal,
    })) {
      if (chunk && chunk.type === 'text-delta') text += chunk.text ?? ''
    }
    const parsed = extractJson(text) ?? salvage(text)
    if (!parsed) return { ok: false, source: 'heuristic', error: `模型返回里没有可解析的 JSON：${text.slice(0, 120)}` }
    return {
      ok: true,
      source: 'llm',
      description: typeof parsed.description === 'string' ? parsed.description.trim() : undefined,
      whenToUse: typeof parsed.whenToUse === 'string' ? parsed.whenToUse.trim() : undefined,
      category: typeof parsed.category === 'string' ? parsed.category.trim() : undefined,
      translated: typeof parsed.translated === 'string' ? parsed.translated.trim() : undefined,
    }
  } catch (error) {
    return {
      ok: false,
      source: 'heuristic',
      error: `模型调用失败：${error instanceof Error ? error.message : String(error)}`,
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * JSON 解析失败时的兜底：按字段名抠出值。
 * @param {string} text - 模型输出
 * @returns {object | undefined} 抢救出来的对象
 */
function salvage(text) {
  const field = (name) => {
    const match = new RegExp(`["']?${name}["']?\\s*[:：]\\s*["']([^"'\\n]{2,200})["']`, 'i').exec(text)
    return match?.[1]?.trim()
  }
  const description = field('description')
  const whenToUse = field('whenToUse')
  const category = field('category')
  const translated = field('translated')
  if (!description && !whenToUse && !category && !translated) return undefined
  return { description, whenToUse, category, translated }
}
