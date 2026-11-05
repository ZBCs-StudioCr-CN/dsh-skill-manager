/** 设置页「技能」分区：启用、默认加载、分类、智能归类、剪贴板导入与 SKILL.md 编写。 */

import * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, setCwd } from './api'
import type { CatalogPayload, Category, DefaultScope, Preferences, SkillRow } from './api'

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

const EMPTY_PREFERENCES: Preferences = { disabled: [], defaultLoaded: [], defaultScopes: [], categories: [] }

/** 默认加载的作用域选择。 */
type ScopeChoice = { kind: 'global' } | { kind: 'project' } | { kind: 'preset'; target: string }

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
  const [scope, setScope] = useState<ScopeChoice>({ kind: 'global' })
  const [presetName, setPresetName] = useState('standard')
  const zipInput = useRef<HTMLInputElement | null>(null)
  const [suggestLang, setSuggestLang] = useState<'zh' | 'en'>('zh')
  const [suggesting, setSuggesting] = useState<string | undefined>()
  const [progress, setProgress] = useState<{ done: number; total: number } | undefined>()
  const autoRan = useRef(false)

  const preferences = data?.preferences ?? EMPTY_PREFERENCES
  const showSuggestions = preferences.showAiSuggestions !== false

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

  // 默认就自动补全：打开面板后，把还没有建议的技能排队生成一次（每个技能只自动跑一次）。
  useEffect(() => {
    if (!data || autoRan.current || progress) return
    if (data.preferences.showAiSuggestions === false) return
    const missing = data.skills.filter((skill) => !skill.aiSuggestion?.description)
    if (missing.length === 0) return
    autoRan.current = true
    void generateAll(false)
  }, [data, progress])

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

  /** 当前选择的作用域目标：项目根或预设名。 */
  const scopeTarget = scope.kind === 'project' ? (data?.projectRoot ?? data?.cwd ?? '') : scope.kind === 'preset' ? presetName.trim() : ''

  /** 某个技能在哪些作用域里被设为默认。 */
  const scopesOf = (name: string): string[] => {
    const labels: string[] = []
    if (preferences.defaultLoaded.includes(name)) labels.push('全局')
    for (const item of preferences.defaultScopes) {
      if (item.skills.includes(name)) labels.push(item.kind === 'project' ? '本项目' : `预设:${item.target}`)
    }
    return labels
  }

  /** 当前作用域下这个技能是否已设为默认。 */
  const isDefaultInScope = (name: string): boolean => {
    if (scope.kind === 'global') return preferences.defaultLoaded.includes(name)
    const found = preferences.defaultScopes.find((item) => item.kind === scope.kind && item.target.toLowerCase() === scopeTarget.toLowerCase())
    return found?.skills.includes(name) ?? false
  }

  /** 切换默认加载（写到当前选中的作用域）。 */
  const toggleDefault = async (skill: SkillRow) => {
    if (scope.kind === 'global') {
      const defaults = new Set(preferences.defaultLoaded)
      if (defaults.has(skill.name)) defaults.delete(skill.name)
      else defaults.add(skill.name)
      await persist(
        { ...preferences, defaultLoaded: [...defaults] },
        defaults.has(skill.name) ? `${skill.name} 将在每个新对话默认加载` : `已取消 ${skill.name} 的全局默认加载`,
      )
      return
    }
    if (!scopeTarget) {
      setError('先填写预设名，再设默认')
      return
    }
    const list: DefaultScope[] = preferences.defaultScopes.map((item) => ({ ...item, skills: [...item.skills] }))
    const index = list.findIndex((item) => item.kind === scope.kind && item.target.toLowerCase() === scopeTarget.toLowerCase())
    const existing: DefaultScope = index >= 0 ? list[index] : { kind: scope.kind, target: scopeTarget, skills: [] }
    const skills = new Set(existing.skills)
    if (skills.has(skill.name)) skills.delete(skill.name)
    else skills.add(skill.name)
    const next: DefaultScope = { ...existing, skills: [...skills] }
    if (index >= 0) {
      if (next.skills.length === 0) list.splice(index, 1)
      else list[index] = next
    } else if (next.skills.length > 0) {
      list.push(next)
    }
    const where = scope.kind === 'project' ? '本项目' : `预设 ${scopeTarget}`
    await persist(
      { ...preferences, defaultScopes: list },
      skills.has(skill.name) ? `已在${where}默认加载 ${skill.name}` : `已取消 ${skill.name} 在${where}的默认加载`,
    )
  }

  /** 把 /name 复制到剪贴板，绝不自动发送。 */
  const loadIntoConversation = async (skill: SkillRow) => {
    const ok = await copyText(`/${skill.name} `)
    setNotice(ok ? `已复制 /${skill.name}，粘贴到输入框回车即可带入本次对话` : '复制失败：浏览器拒绝了剪贴板写入')
  }

  /** 智能归类：交给模型按产品/项目阶段分组，失败才退回关键词规则。 */
  const runClassify = async () => {
    setBusy('classify')
    try {
      const result = await api.classify(preferences.categories)
      const assigned = result.suggestions?.length ?? 0
      const created = result.created?.length ?? 0
      if (assigned === 0 && created === 0) {
        setNotice('没有需要归类的技能')
        return
      }
      await persist(
        { ...preferences, categories: result.categories },
        result.source === 'llm'
          ? `AI 已按阶段归出 ${created} 个分类`
          : `模型不可用，已退回关键词归类（${result.warning ?? '未知原因'}）`,
      )
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(undefined)
    }
  }

  /** 生成一条 AI 建议：只落在旁路文件里，绝不覆盖原来的描述。 */
  const runSuggest = async (skill: SkillRow) => {
    setSuggesting(skill.name)
    try {
      const result = await api.describe(skill.name, skill.rootKey, suggestLang)
      setNotice(result.ok ? `已重新生成 /${skill.name} 的 AI 建议` : `AI 建议生成失败：${result.error ?? '未知原因'}`)
      await reload()
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setSuggesting(undefined)
    }
  }

  /**
   * 批量生成 AI 建议。
   * @param force - 为真时连已有的也重新生成
   */
  const generateAll = async (force = false) => {
    if (progress) return
    const targets = skills.filter((skill) => force || !skill.aiSuggestion?.description)
    if (targets.length === 0) {
      setNotice('所有技能都已有 AI 建议；再点一次就是全部重新生成')
      return
    }
    setProgress({ done: 0, total: targets.length })
    setNotice(`正在生成 AI 建议 0/${targets.length}…`)
    let failed = 0
    for (const [index, skill] of targets.entries()) {
      try {
        await api.describe(skill.name, skill.rootKey, suggestLang)
      } catch {
        failed += 1
      }
      setProgress({ done: index + 1, total: targets.length })
      setNotice(`正在生成 AI 建议 ${index + 1}/${targets.length}…`)
    }
    setProgress(undefined)
    await reload()
    setNotice(`AI 建议完成：${targets.length - failed}/${targets.length}${failed > 0 ? `，${failed} 个失败（模型未返回可解析 JSON）` : ''}`)
  }

  /** 开关「显示 AI 建议」。 */
  const toggleShowSuggestions = async () => {
    await persist({ ...preferences, showAiSuggestions: !showSuggestions })
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

  /** 导入本地目录：优先宿主原生选择器，退化为手填绝对路径。 */
  const importDirectory = async () => {
    setBusy('import-dir')
    try {
      const picked = await api.pickDirectory()
      let source = picked.ok && picked.path ? picked.path : undefined
      if (!source) {
        source = (window.prompt('输入技能目录的绝对路径（目录里要有 SKILL.md，或只含一个技能子目录）') ?? undefined) || undefined
      }
      if (!source) {
        setNotice(picked.error ?? '已取消选择目录')
        return
      }
      const result = await api.importDir(source, writableRoot?.key)
      await reload()
      setNotice(`已从目录导入 ${result.name}`)
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(undefined)
    }
  }

  /** 处理选中的 zip 文件。 */
  const importZipFile = async (file: File | undefined) => {
    if (!file) return
    setBusy('import-zip')
    try {
      const data = await readBase64(file)
      const result = await api.importZip(data, writableRoot?.key)
      await reload()
      setNotice(`已从 ${file.name} 导入 ${result.name}`)
      setError(undefined)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setBusy(undefined)
      if (zipInput.current) zipInput.current.value = ''
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
            {busy === 'classify' ? '归类中…' : 'AI 智能归类'}
          </button>
          <label className="skm-check" title="关闭后不再自动生成，也不显示建议行">
            <input type="checkbox" checked={showSuggestions} onChange={() => void toggleShowSuggestions()} />
            显示 AI 建议
          </label>
          <button
            type="button"
            className="skm-btn"
            onClick={() => void generateAll(skills.some((skill) => skill.aiSuggestion?.description))}
            disabled={progress !== undefined || skills.length === 0}
          >
            {progress ? `生成中 ${progress.done}/${progress.total}` : skills.some((skill) => skill.aiSuggestion?.description) ? '重新生成全部 AI 建议' : '一键生成 AI 建议'}
          </button>
          <select
            className="skm-input"
            style={{ maxWidth: 116 }}
            value={suggestLang}
            onChange={(event) => setSuggestLang(event.target.value === 'en' ? 'en' : 'zh')}
            title="AI 建议的输出语言"
          >
            <option value="zh">AI 建议·中文</option>
            <option value="en">AI 建议·EN</option>
          </select>
          <button type="button" className="skm-btn" onClick={() => void importFromClipboard()}>从剪贴板导入</button>
          <button type="button" className="skm-btn" onClick={() => void importDirectory()} disabled={busy !== undefined}>
            {busy === 'import-dir' ? '选择中…' : '导入目录'}
          </button>
          <button type="button" className="skm-btn" onClick={() => zipInput.current?.click()} disabled={busy !== undefined}>
            {busy === 'import-zip' ? '导入中…' : '导入 ZIP'}
          </button>
          <input
            ref={zipInput}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={(event) => void importZipFile(event.target.files?.[0])}
          />
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

      <div className="skm-actions">
        <span className="skm-notice">「设默认」写入：</span>
        <select
          className="skm-input"
          style={{ maxWidth: 150 }}
          value={scope.kind}
          onChange={(event) => {
            const kind = event.target.value as ScopeChoice['kind']
            setScope(kind === 'preset' ? { kind: 'preset', target: presetName } : { kind })
          }}
        >
          <option value="global">全局</option>
          <option value="project">本项目</option>
          <option value="preset">按预设</option>
        </select>
        {scope.kind === 'project' ? (
          <span className="skm-notice">{scopeTarget || '（尚未解析出项目根）'}</span>
        ) : null}
        {scope.kind === 'preset' ? (
          <input
            className="skm-input"
            style={{ maxWidth: 180 }}
            value={presetName}
            placeholder="预设名，如 standard"
            onChange={(event) => {
              setPresetName(event.target.value)
              setScope({ kind: 'preset', target: event.target.value })
            }}
          />
        ) : null}
        {preferences.defaultScopes.length > 0 ? (
          <span className="skm-notice">
            已有作用域：{preferences.defaultScopes.map((item) => `${item.kind === 'project' ? '项目' : '预设'}:${item.target}（${item.skills.length}）`).join('、')}
          </span>
        ) : null}
      </div>

      {managing ? (
        <div className="skm-card">
          <div className="skm-card__head">
            <h4 className="skm-card__title">分类管理</h4>
            <button type="button" className="skm-btn skm-btn--ghost" onClick={() => setManaging(false)} aria-label="关闭分类管理">✕ 关闭</button>
          </div>
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
              {showSuggestions ? (
                <div className="skm-ai-line">
                  <span className="skm-ai-line__label">AI 建议</span>
                  {skill.aiSuggestion?.description ? (
                    <span className="skm-ai-line__text">
                      {skill.aiSuggestion.description}
                      {skill.aiSuggestion.whenToUse ? `（何时用：${skill.aiSuggestion.whenToUse}）` : ''}
                      {skill.aiSuggestion.category ? ` · 分类建议：${skill.aiSuggestion.category}` : ''}
                    </span>
                  ) : (
                    <span className="skm-ai-line__text skm-ai-line__text--pending">
                      {progress ? '排队生成中…' : '还没有建议，点右侧「重新生成」'}
                    </span>
                  )}
                  <button
                    type="button"
                    className="skm-btn skm-btn--ghost"
                    onClick={() => void runSuggest(skill)}
                    disabled={suggesting === skill.name || progress !== undefined}
                  >
                    {suggesting === skill.name ? '生成中…' : '重新生成'}
                  </button>
                </div>
              ) : null}
              <div className="skm-tags">
                <span className="skm-tag">{skill.source}</span>
                {scopesOf(skill.name).map((label) => <span className="skm-tag skm-tag--cat" key={label}>默认·{label}</span>)}
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
              <button type="button" className="skm-btn skm-btn--ghost" onClick={() => void toggleDefault(skill)} title="把当前作用域设为默认加载">
                {isDefaultInScope(skill.name) ? '取消默认' : '设默认'}
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
 * 把文件读成 base64（去掉 data URL 前缀），用于 zip 上传。
 * @param file - 浏览器文件对象
 * @returns base64 文本
 */
async function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      resolve(text.includes(',') ? text.slice(text.indexOf(',') + 1) : text)
    }
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
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
