/** 浏览器半边的 HTTP 客户端：只跟本插件的 /api 路由打交道。 */

const ROUTE = '/api/dsh-skill-manager'

/** 当前会话目录，由面板钉住后随每次请求带上，避免两次请求落到不同项目。 */
let pinnedCwd: string | null = null

/**
 * 设置本次面板使用的项目目录。
 * @param cwd - 绝对路径
 */
export function setCwd(cwd: string | null): void {
  pinnedCwd = cwd
}

/**
 * 打一次宿主接口。
 * @param path - 端点路径
 * @param body - POST 请求体
 * @param raw - 为真时不把 `ok:false` 当异常抛出，直接返回原始负载
 * @returns 响应体
 */
async function request<T>(path: string, body?: unknown, raw = false): Promise<T> {
  const query = pinnedCwd ? `${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(pinnedCwd)}` : ''
  const response = await fetch(`${ROUTE}${path}${query}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!payload) {
    if (response.status === 401) throw new Error('浏览器会话未通过鉴权（HTTP 401）：请从 DSH 界面打开并刷新')
    if (response.status === 403) throw new Error('宿主拒绝了本次请求（HTTP 403）：当前访问的主机不在受信列表')
    throw new Error(`接口返回了非 JSON 响应（HTTP ${response.status}）`)
  }
  if (!raw && payload.ok === false) throw new Error(payload.error ?? '宿主返回了错误')
  return payload as T
}

export interface SkillRoot {
  readonly key: string
  readonly source: string
  readonly rank: number
  readonly path: string
  readonly readOnly: boolean
}

/** 模型给出的描述建议（旁路存储，不写回文件）。 */
export interface AiSuggestion {
  readonly description?: string
  readonly whenToUse?: string
  readonly category?: string
  readonly source?: 'llm' | 'heuristic'
  readonly lang?: 'zh' | 'en'
  readonly at?: string
  readonly error?: string
}

export interface SkillRow {
  readonly name: string
  readonly description: string
  readonly whenToUse: string
  readonly path: string
  readonly rootKey: string
  readonly source: string
  readonly rank: number
  readonly readOnly: boolean
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
  readonly enabled: boolean
  readonly defaultLoaded: boolean
  readonly categoryIds: readonly string[]
  readonly aiSuggestion?: AiSuggestion
}

export interface Category {
  readonly id: string
  readonly name: string
  readonly keywords: readonly string[]
  readonly skills: readonly string[]
}

/** 一个作用域上的默认加载集合：项目根或 agent 预设。 */
export interface DefaultScope {
  readonly id?: string
  readonly kind: 'project' | 'preset'
  readonly target: string
  readonly skills: readonly string[]
}

export interface Preferences {
  readonly disabled: readonly string[]
  readonly defaultLoaded: readonly string[]
  readonly defaultScopes: readonly DefaultScope[]
  readonly categories: readonly Category[]
}

export interface CatalogPayload {
  readonly cwd: string
  readonly projectRoot: string
  readonly roots: readonly SkillRoot[]
  readonly skillRoot?: string
  readonly preferences: Preferences
  readonly preferencesPath: string
  readonly skills: readonly SkillRow[]
  readonly shadowed: readonly (SkillRow & { shadowedBy: string })[]
}

export interface Suggestion {
  readonly skill: string
  readonly categoryId: string | null
  readonly score?: number
  readonly matched?: readonly string[]
}

/** 模型（或兜底规则）给出的描述建议。 */
export interface DescribeResult {
  readonly ok: boolean
  readonly source: 'llm' | 'heuristic'
  readonly description?: string
  readonly whenToUse?: string
  readonly category?: string
  readonly translated?: string
  readonly error?: string
  readonly lang?: 'zh' | 'en'
}

export const api = {
  catalog: () => request<CatalogPayload>('/catalog'),
  registry: () => request<{ complete: boolean; skills: Array<{ name: string; provider: string; modelInvocable: boolean }> }>('/registry'),
  savePreferences: (preferences: Preferences) => request<{ preferences: Preferences }>('/preferences', { preferences }),
  classify: (categories: readonly Category[]) =>
    request<{ source?: 'llm' | 'heuristic'; warning?: string; suggestions: Suggestion[]; categories: Category[]; created: string[] }>(
      '/classify',
      { categories: [...categories], mode: 'ai', autoCreate: true },
    ),
  describe: (name: string, rootKey: string, lang: 'zh' | 'en') =>
    request<DescribeResult>('/skill/describe', { name, rootKey, lang }, true),
  dismissSuggestion: (name: string) => request<Record<string, never>>('/skill/suggestion', { name }),
  updateMeta: (body: { name: string; rootKey: string; description?: string; whenToUse?: string }) =>
    request<{ path: string }>('/skill/meta', body),
  read: (name: string, rootKey: string) => request<{ content: string; path: string }>(`/skill?name=${encodeURIComponent(name)}&rootKey=${encodeURIComponent(rootKey)}`),
  create: (body: SkillWrite) => request<{ path: string }>('/skill/create', body),
  save: (body: SkillWrite) => request<{ path: string }>('/skill/save', body),
  remove: (name: string, rootKey: string) => request<Record<string, never>>('/skill/delete', { name, rootKey }),
  importText: (text: string, rootKey?: string) => request<{ name: string; path: string }>('/skill/import', { text, rootKey }),
  importDir: (sourcePath: string, rootKey?: string) => request<{ name: string; path: string }>('/skill/import-dir', { sourcePath, rootKey }),
  importZip: (data: string, rootKey?: string) => request<{ name: string; path: string }>('/skill/import-zip', { data, rootKey }),
  pickDirectory: () => request<{ ok: boolean; kind: string; path?: string | null; error?: string }>('/pick-directory', {}, true),
  open: (rootKey?: string) => request<{ opened: boolean; path?: string }>(`/open?rootKey=${encodeURIComponent(rootKey ?? '')}`),
}

export interface SkillWrite {
  readonly name: string
  readonly rootKey: string
  readonly description: string
  readonly whenToUse: string
  readonly body: string
  readonly disableModelInvocation: boolean
  readonly userInvocable: boolean
}
