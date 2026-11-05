/** 调宿主模型取一段纯文本；失败往上抛，由调用方决定怎么兜底。 */

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
 * 造一条最小的 user 消息（形状与 @deepseek-ai/dsh-llm 的 createUserMessage 一致）。
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
 * 调一次模型，把文本增量拼起来返回。
 * @param {object} options - 参数
 * @param {object|undefined} options.llm - ctx.llm
 * @param {{ provider: string, model: string }} options.route - 模型路由
 * @param {string} options.system - system 提示
 * @param {string} options.user - user 提示
 * @param {number} [options.maxTokens] - 输出上限
 * @param {number} [options.timeoutMs] - 超时
 * @param {AbortSignal} [options.signal] - 外部取消
 * @returns {Promise<string>} 模型输出文本
 */
export async function streamText({ llm, route, system, user, maxTokens = 600, timeoutMs = 45_000, signal }) {
  if (!llm || typeof llm.stream !== 'function') throw new Error('模型服务不可用')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    let text = ''
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system,
      messages: [userMessage(user)],
      temperature: 0.1,
      maxTokens,
      signal: controller.signal,
    })) {
      if (chunk && chunk.type === 'text-delta') text += chunk.text ?? ''
    }
    return text
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}
