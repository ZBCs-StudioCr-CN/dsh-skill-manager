/** 设置页「技能」分区：启用、默认加载、分类、智能归类、剪贴板导入与 SKILL.md 编写。 */

import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { api, setCwd } from './api'
import type { CatalogPayload, Category, Preferences, SkillRow, Suggestion } from './api'

interface Editing {
  readonly mode: 'new' | 'edit'
  readonly name: string
  readonly description: string
  readonly whenToUse: string
  readonly body: string
  readonly disableModelInvocation: boolean
  readonly userInvocable: boolean
  readonly categoryIds: readonly string[]
  readonly rootKey: string
}

const EMPTY_PREFERENCES: Preferences = { disabled: [], defaultLoaded: [], categories: [] }

/**
 * 复制文本到剪贴板。
 * @param text - 要复制的文本
 * @returns 是否成功
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * 生成分类 id。
 * @param name - 分类名
 * @returns id
 */
function categoryId(name: string): string {
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return id || `category-${Date.now().toString(36)}`
}

export function Panel(props: { useSessions?: (selector: (state: any) => any) => any }): JSX.Element {
  const [data, setData] = useState<CatalogPayload | null>(null)
  const [error, setError] = useState<string | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [editing, setEditing] = useState<Editing | undefined>()
  const [importText, setImportText] = useState<string | undefined>()
  const [importRoot, setImportRoot] = useState<string | undefined>()
  const [managing, setManaging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>()
  const [busy, setBusy] = useState<string | undefined>()

  const preferences = data?.preferences ?? EMPTY_PREFERENCES

  /** 拉一次目录。 */
  const reload = useCallback(async () => {
    try {
      const payload = await api.catalog()
      setData(payload)
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // 会话切换后项目根可能变化，跟着刷新一次；拿不到就保持宿主默认。
  const currentSession = props?.useSessions ? props.useSessions((state: any) => state?.current) : undefined
  useEffect(() => {
    if (!currentSession) return
    const cwd = currentSession?.header?.cwd ?? currentSession?.cwd
    if (typeof cwd === 'string' && cwd.trim()) {
      setCwd(cwd)
      void reload()
    }
  }, [currentSession, reload])

  /** 保存整份偏好并刷新。 */
  const persist = useCallback(
    async (next: Preferences, message?: string) => {
      try {
        await api.savePreferences(next)
        await reload()
        if (message) setNotice(message)
        setError(undefined)
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure))
      }
    },
    [reload],
  )

  /** 切换启用状态（写偏好，不动源文件）。 */
  const toggleEnabled = async (skill: SkillRow) => {
    const disabled = new Set(preferences.disabled)
    if (disabled.has(skill.name)) disabled.delete(skill.name)
    else disabled.add(skill.name)
    await persist({ ...preferences, disabled: [...disabled] }, disabled.has(skill.name) ? `已停用 ${skill.name}` : `已启用 ${skill.name}`)
  }

  /** 切换默认加载。 */
  const toggleDefault = async (skill: SkillRow) => {
    const defaults = new Set(preferences.defaultLoaded)
    if (defaults.has(skill.name)) defaults.delete(skill.name)
    else defaults.add(skill.name)
    await persist({ ...preferences, defaultLoaded: [...defaults] }, defaults.has(skill.name) ? `${skill.name} 将在每个新对话默认加载` : `已取消 ${skill.name} 的默认加载`)
  }

  /** 把 /name 复制到剪贴板，绝不自动发送。 */
  const loadIntoConversation = async (skill: SkillRow) => {
    const ok = await copyText(`/${skill.name} `)
    setNotice(ok ? `已复制 /${skill.name}，粘贴到输入框回车即可带入本次对话` : '复制失败：浏览器拒绝了剪贴板写入')
  }

  /** 智能归类：给未归类技能建议分类，采纳后写回偏好。 */
  const runClassify = async () => {
    setBusy('classify')
    try {
      const { suggestions } = await api.classify(preferences.categories)
      const accepted = suggestions.filter((item: Suggestion) => item.categoryId)
      if (accepted.length === 0) {
        setNotice('没有找到新的可归类技能')
        return
      }
      const categories = (preferences.categories.length > 0 ? preferences.categories : defaultCategories()).map((category) => ({
        ...category,
        skills: [...new Set([...category.skills, ...accepted.filter((item) => item.categoryId === category.id).map((item) => item.skill)])],
      }))
      await persist({ ...preferences, categories }, `已按关键词归类 ${accepted.length} 个技能`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(undefined)
    }
  }

  /** 新建分类。 */
  const addCategory = async () => {
    const id = categoryId('新分类')
    const categories = [...preferences.categories, { id, name: '新分类', keywords: [], skills: [] }]
    await persist({ ...preferences, categories }, '已新增分类，记得改名')
  }

  /** 更新分类。 */
  const updateCategory = async (next: Category) => {
    const categories = preferences.categories.map((category) => (category.id === next.id ? next : category))
    await persist({ ...preferences, categories })
  }

  /** 删除分类。 */
  const removeCategory = async (id: string) => {
    await persist({ ...preferences, categories: preferences.categories.filter((category) => category.id !== id) }, '已删除分类')
  }

  /** 写入一个技能。 */
  const submitEditing = async () => {
    if (!editing) return
    const name = editing.name.trim()
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      setError('技能名必须是 kebab-case：小写字母、数字、连字符')
      return
    }
    setBusy('save')
    try {
      const body = {
        name,
        rootKey: editing.rootKey,
        description: editing.description,
        whenToUse: editing.whenToUse,
        body: editing.body,
        disableModelInvocation: editing.disableModelInvocation,
        userInvocable: editing.userInvocable,
      }
      if (editing.mode === 'new') await api.create(body)
      else await api.save(body)

      const categories = preferences.categories.map((category) => ({
        ...category,
        skills: editing.categoryIds.includes(category.id)
          ? [...new Set([...category.skills, name])]
          : category.skills.filter((item) => item !== name),
      }))
      await persist({ ...preferences, categories }, editing.mode === 'new' ? `已新建 ${name}` : `已保存 ${name}`)
      setEditing(undefined)
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(undefined)
    }
  }

  /** 打开编辑器。 */
  const beginEdit = async (skill: SkillRow) => {
    try {
      const { content } = await api.read(skill.name, skill.rootKey)
      const { body, description, whenToUse, disableModelInvocation, userInvocable } = splitContent(content, skill)
      setEditing({
        mode: 'edit',
        name: skill.name,
        description,
        whenToUse,
        body,
        disableModelInvocation,
        userInvocable,
        categoryIds: skill.categoryIds,
        rootKey: skill.rootKey,
      })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  /** 删除技能。 */
  const removeSkill = async (skill: SkillRow) => {
    setBusy(skill.name)
    try {
      await api.remove(skill.name, skill.rootKey)
      setConfirmDelete(undefined)
      await reload()
      setNotice(`已删除 ${skill.name}`)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(undefined)
    }
  }

  /** 从剪贴板导入。 */
  const importFromClipboard = async () => {
    const text = await readClipboard()
    setImportText(text ?? '')
    setImportRoot(data?.roots.find((root) => !root.readOnly)?.key)
  }

  /** 提交导入。 */
  const submitImport = async () => {
    if (!importText?.trim()) {
      setError('剪贴板内容为空，先复制一段 SKILL.md 再试')
      return
    }
    setBusy('import')
    try {
      const result = await api.importText(importText, importRoot)
      setImportText(undefined)
      await reload()
      setNotice(`已导入 ${result.name}`)
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(undefined)
    }
  }

  const skills = data?.skills ?? []
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return skills.filter((skill) => {
      if (needle && !`${skill.name} ${skill.description} ${skill.whenToUse}`.toLowerCase().includes(needle)) return false
      if (filter === 'all') return true
      if (filter === 'uncategorized') return skill.categoryIds.length === 0
      return skill.categoryIds.includes(filter)
    })
  }, [skills, query, filter])

  const countOf = (id: string) => skills.filter((skill) => skill.categoryIds.includes(id)).length
  const writableRoot = data?.roots.find((root) => !root.readOnly)

  return (
    <section className="skm-section">
      <header className="skm-head">
        <div className="skm-head__text">
          <h3 className="skm-title">技能管理</h3>
          <p className="skm-sub">
            {skills.length} 个技能 · 根目录 {data?.skillRoot ?? '未解析'} · 启用状态与分类保存在 {data?.preferencesPath ?? '…'}
          </p>
        </div>
        <div className="skm-actions">
          <button type="button" className="skm-btn" onClick={() => void reload()} disabled={busy !== undefined}>刷新</button>
          <button type="button" className="skm-btn" onClick={() => void runClassify()} disabled={busy !== undefined || skills.length === 0}>
            {busy === 'classify' ? '归类中…' : '智能归类'}
          </button>
          <button type="button" className="skm-btn" onClick={() => void importFromClipboard()}>从剪贴板导入</button>
          <button
            type="button"
            className="skm-btn skm-btn--primary"
            onClick={() => setEditing({
              mode: 'new', name: '', description: '', whenToUse: '', body: '', disableModelInvocation: false,
              userInvocable: false, categoryIds: [], rootKey: writableRoot?.key ?? 'user-dsh',
            })}
          >
            新建技能
          </button>
        </div>
      </header>

      {error ? <p className="skm-notice skm-notice--error">⚠ {error}</p> : null}
      {notice ? <p className="skm-notice">{notice}</p> : null}

      <div className="skm-actions">
        <input className="skm-search" placeholder="搜索技能名或描述" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="skm-btn skm-btn--ghost" onClick={() => void api.open(writableRoot?.key).then((result) => setNotice(result.opened ? `已打开 ${result.path}` : `目录：${result.path}`))}>
          打开文件夹
        </button>
        <button type="button" className="skm-btn skm-btn--ghost" onClick={() => setManaging(!managing)}>
          {managing ? '收起分类管理' : '管理分类'}
        </button>
      </div>

      <div className="skm-chips">
        <button type="button" className={`skm-chip${filter === 'all' ? ' skm-chip--active' : ''}`} onClick={() => setFilter('all')}>
          全部 <span className="skm-chip__count">{skills.length}</span>
        </button>
        <button type="button" className={`skm-chip${filter === 'uncategorized' ? ' skm-chip--active' : ''}`} onClick={() => setFilter('uncategorized')}>
          未归类 <span className="skm-chip__count">{skills.filter((skill) => skill.categoryIds.length === 0).length}</span>
        </button>
        {preferences.categories.map((category) => (
          <button type="button" key={category.id} className={`skm-chip${filter === category.id ? ' skm-chip--active' : ''}`} onClick={() => setFilter(category.id)}>
            {category.name} <span className="skm-chip__count">{countOf(category.id)}</span>
          </button>
        ))}
      </div>

      {managing ? (
        <div className="skm-card">
          <h4 className="skm-card__title">分类管理</h4>
          <div className="skm-cats">
            {preferences.categories.length === 0 ? <p className="skm-notice">还没有分类。点「智能归类」会自动建立默认分类，也可以手动新增。</p> : null}
            {preferences.categories.map((category) => (
              <div className="skm-cat" key={category.id}>
                <input
                  className="skm-input"
                  style={{ maxWidth: 160 }}
                  value={category.name}
                  onChange={(event) => void updateCategory({ ...category, name: event.target.value })}
                />
                <input
                  className="skm-input"
                  style={{ flex: '1 1 240px' }}
                  placeholder="额外关键词，用逗号分隔"
                  value={category.keywords.join(', ')}
                  onChange={(event) => void updateCategory({ ...category, keywords: event.target.value.split(',').map((word) => word.trim()).filter(Boolean) })}
                />
                <span className="skm-cat__meta">{category.skills.length} 个技能</span>
                <span className="skm-spacer" />
                <button type="button" className="skm-btn skm-btn--danger" onClick={() => void removeCategory(category.id)}>删除</button>
              </div>
            ))}
          </div>
          <div>
            <button type="button" className="skm-btn" onClick={() => void addCategory()}>新增分类</button>
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="skm-card">
          <h4 className="skm-card__title">{editing.mode === 'new' ? '新建技能' : `编辑 ${editing.name}`}</h4>
          <div className="skm-grid">
            <label className="skm-field">
              技能名（kebab-case）
              <input className="skm-input" value={editing.name} disabled={editing.mode === 'edit'} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
            </label>
            <label className="skm-field">
              写入位置
              <select className="skm-input" value={editing.rootKey} onChange={(event) => setEditing({ ...editing, rootKey: event.target.value })}>
                {(data?.roots ?? []).filter((root) => !root.readOnly).map((root) => (
                  <option key={root.key} value={root.key}>{root.source} · {root.path}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="skm-field">
            一句话描述（用于路由）
            <input className="skm-input" value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} />
          </label>
          <label className="skm-field">
            何时使用（可选）
            <input className="skm-input" value={editing.whenToUse} onChange={(event) => setEditing({ ...editing, whenToUse: event.target.value })} />
          </label>
          <label className="skm-field">
            正文（SKILL.md 的 Markdown 部分）
            <textarea className="skm-textarea" value={editing.body} onChange={(event) => setEditing({ ...editing, body: event.target.value })} />
          </label>
          <div className="skm-chips">
            <span className="skm-field" style={{ flexDirection: 'row', alignItems: 'center' }}>归属分类：</span>
            {preferences.categories.map((category) => (
              <label className="skm-check" key={category.id}>
                <input
                  type="checkbox"
                  checked={editing.categoryIds.includes(category.id)}
                  onChange={(event) => setEditing({
                    ...editing,
                    categoryIds: event.target.checked
                      ? [...editing.categoryIds, category.id]
                      : editing.categoryIds.filter((id) => id !== category.id),
                  })}
                />
                {category.name}
              </label>
            ))}
          </div>
          <div className="skm-chips">
            <label className="skm-check">
              <input type="checkbox" checked={editing.disableModelInvocation} onChange={(event) => setEditing({ ...editing, disableModelInvocation: event.target.checked })} />
              模型不可自动调用（disable-model-invocation）
            </label>
            <label className="skm-check">
              <input type="checkbox" checked={editing.userInvocable} onChange={(event) => setEditing({ ...editing, userInvocable: event.target.checked })} />
              允许用户用 /name 调用
            </label>
          </div>
          <div className="skm-actions">
            <button type="button" className="skm-btn skm-btn--primary" onClick={() => void submitEditing()} disabled={busy !== undefined}>
              {busy === 'save' ? '保存中…' : '保存'}
            </button>
            <button type="button" className="skm-btn" onClick={() => setEditing(undefined)}>取消</button>
          </div>
        </div>
      ) : null}

      {importText !== undefined ? (
        <div className="skm-card">
          <h4 className="skm-card__title">从剪贴板导入</h4>
          <p className="skm-notice">粘贴一段 SKILL.md（可带 frontmatter）。技能名取 frontmatter 的 name、第一个一级标题，或自动转写。</p>
          <textarea className="skm-textarea" placeholder={'---\nname: my-skill\ndescription: 这个技能做什么\n---\n\n# 正文标题\n\n规则…'} value={importText} onChange={(event) => setImportText(event.target.value)} />
          <label className="skm-field">
            导入到
            <select className="skm-input" value={importRoot} onChange={(event) => setImportRoot(event.target.value)}>
              {(data?.roots ?? []).filter((root) => !root.readOnly).map((root) => (
                <option key={root.key} value={root.key}>{root.source} · {root.path}</option>
              ))}
            </select>
          </label>
          <div className="skm-actions">
            <button type="button" className="skm-btn" onClick={async () => setImportText((await readClipboard()) ?? '')}>重新读取剪贴板</button>
            <button type="button" className="skm-btn skm-btn--primary" onClick={() => void submitImport()} disabled={busy !== undefined}>
              {busy === 'import' ? '导入中…' : '导入'}
            </button>
            <button type="button" className="skm-btn" onClick={() => setImportText(undefined)}>取消</button>
          </div>
        </div>
      ) : null}

      <div className="skm-list">
        {filtered.length === 0 ? <p className="skm-empty">{skills.length === 0 ? '还没有技能。新建一个，或从剪贴板导入。' : '没有符合筛选条件的技能。'}</p> : null}
        {filtered.map((skill) => (
          <div className={`skm-row${skill.enabled ? '' : ' skm-row--off'}`} key={`${skill.rootKey}/${skill.name}`}>
            <div className="skm-row__main">
              <div className="skm-name">/{skill.name}</div>
              <div className="skm-desc">{skill.description || '（无描述）'}</div>
              <div className="skm-tags">
                <span className="skm-tag">{skill.source}</span>
                {skill.defaultLoaded ? <span className="skm-tag skm-tag--cat">默认加载</span> : null}
                {skill.categoryIds.map((id) => {
                  const category = preferences.categories.find((item) => item.id === id)
                  return category ? <span className="skm-tag" key={id}>{category.name}</span> : null
                })}
                {skill.readOnly ? <span className="skm-tag skm-tag--warn">只读</span> : null}
              </div>
            </div>
            <div className="skm-row__side">
              <button type="button" className="skm-btn skm-btn--ghost" onClick={() => void loadIntoConversation(skill)}>载入对话</button>
              <button type="button" className="skm-btn skm-btn--ghost" disabled={skill.readOnly} onClick={() => void beginEdit(skill)}>编辑</button>
              <button type="button" className="skm-btn skm-btn--ghost" onClick={() => void toggleDefault(skill)} title="新对话默认带上">
                {skill.defaultLoaded ? '取消默认' : '设默认'}
              </button>
              {confirmDelete === skill.name ? (
                <>
                  <button type="button" className="skm-btn skm-btn--danger" disabled={busy === skill.name} onClick={() => void removeSkill(skill)}>确认删除</button>
                  <button type="button" className="skm-btn" onClick={() => setConfirmDelete(undefined)}>取消</button>
                </>
              ) : (
                <button type="button" className="skm-btn skm-btn--ghost skm-btn--danger" disabled={skill.readOnly} onClick={() => setConfirmDelete(skill.name)}>删除</button>
              )}
              <button
                type="button"
                className={`skm-switch${skill.enabled ? ' skm-switch--on' : ''}`}
                aria-label={skill.enabled ? '停用' : '启用'}
                title={skill.enabled ? '停用（不改源文件）' : '启用'}
                onClick={() => void toggleEnabled(skill)}
              >
                <span className="skm-switch__knob" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {data && data.shadowed.length > 0 ? (
        <p className="skm-notice">
          另有 {data.shadowed.length} 个同名技能被更高优先级的根遮蔽（例如 {data.shadowed[0].name} 来自 {data.shadowed[0].source}）。
        </p>
      ) : null}
    </section>
  )
}

/**
 * 从 SKILL.md 全文拆出编辑字段。
 * @param content - 全文
 * @param fallback - 目录里已知的信息
 * @returns 字段
 */
function splitContent(content: string, fallback: SkillRow): { body: string; description: string; whenToUse: string; disableModelInvocation: boolean; userInvocable: boolean } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'))
  if (!match) return { body: content.trim(), description: fallback.description, whenToUse: fallback.whenToUse, disableModelInvocation: false, userInvocable: false }
  const attributes: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const item = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line)
    if (item) attributes[item[1]] = item[2].trim().replace(/^["']|["']$/g, '')
  }
  return {
    body: match[2].replace(/^\n+/, '').trim(),
    description: attributes.description ?? fallback.description,
    whenToUse: attributes['when-to-use'] ?? fallback.whenToUse,
    disableModelInvocation: String(attributes['disable-model-invocation'] ?? '').toLowerCase() === 'true',
    userInvocable: String(attributes['user-invocable'] ?? '').toLowerCase() === 'true',
  }
}

/**
 * 读剪贴板文本。
 * @returns 文本，读不到时 undefined
 */
async function readClipboard(): Promise<string | undefined> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return undefined
  }
}

/**
 * 没有分类时客户端侧的默认分类（宿主端有同一份，用于离线兜底）。
 * @returns 默认分类
 */
function defaultCategories(): Category[] {
  return [
    { id: 'design', name: '设计', keywords: ['设计', 'ui', 'ux', '界面'], skills: [] },
    { id: 'competitor-analysis', name: '竞品分析', keywords: ['竞品', '对标'], skills: [] },
    { id: 'market-analysis', name: '市场分析', keywords: ['市场', '获客', '增长'], skills: [] },
    { id: 'planning', name: '项目规划', keywords: ['规划', '排期', 'sprint'], skills: [] },
    { id: 'development', name: '开发', keywords: ['开发', '代码', 'api'], skills: [] },
    { id: 'operations', name: '运营', keywords: ['运营', '日报', '回顾'], skills: [] },
  ]
}
