/** Sidebar skill manager: a centered dialog for enablement, conversation loading, defaults, categories, and SKILL.md authoring. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import {
  IconEditOutline16, IconFolderOpenOutline16, IconListPenOutline16, IconPlusOutline16,
  IconSparkle16, IconTrashOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillEntry, SkillWritePayload } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillCategoryView, SkillManagerFace, SkillManagerResult, SkillPreferencesView } from './slots.ts'
import css from './SkillManagerPanel.module.css'

/** Full panel props composed by the sidebar footer-action slot. */
export type SkillManagerPanelProps =
  PropsRuntime<'sidebar.footer.action'> & InjectFace<SkillManagerFace> & PropsLocale<'skill-manager'>

interface SkillRowState {
  entry: SkillEntry
  categoryIds: readonly string[]
}

type Editing =
  | { kind: 'new'; name: string; description: string; whenToUse: string; userOnly: boolean; disabledModel: boolean; body: string }
  | { kind: 'edit'; original: string; name: string; description: string; whenToUse: string; userOnly: boolean; disabledModel: boolean; body: string }

/** Default categories created on first smart-classify when the user has none, each with match keywords. */
const DEFAULT_CATEGORIES: readonly { id: string; name: string; keywords: readonly string[] }[] = [
  { id: 'design', name: '设计', keywords: ['设计', 'UI', 'UX', '界面', '交互', 'design', '视觉', '样式'] },
  { id: 'competitor-analysis', name: '竞品分析', keywords: ['竞品', '竞争对手', '对标', 'competitor', '竞对', '调研'] },
  { id: 'market-analysis', name: '市场分析', keywords: ['获客', '渠道', '漏斗', '转化', '市场', '增长', '营销', 'ROI', 'acquisition', 'funnel', '留存', '激活', '用户'] },
  { id: 'planning', name: '项目规划', keywords: ['规划', '排期', '计划', 'sprint', 'roadmap', 'backlog', '迭代', '里程碑'] },
  { id: 'development', name: '开发', keywords: ['开发', '代码', 'API', '后端', '前端', '架构', '生成', '实现', 'backend', 'api', '工程', '构建'] },
  { id: 'operations', name: '运营', keywords: ['运营', '同步', '日报', '评审', '回顾', 'onboarding', '社区', '内容', '活动', '站会'] },
]

function useSessionId(useSessions: SkillManagerPanelProps['useSessions']): SessionId | undefined {
  const current = useSessions(state => state.current)
  return current
}

function toCategoryId(name: string): string {
  const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return id.length > 0 ? id : `category-${Date.now().toString(36)}`
}

/** The skill manager dialog: categories on the left, skills (enable / load / default / categories) on the right. */
export function SkillManagerPanel({
  wide,
  useSessions,
  list, read, create, update, remove, openFolder, preferencesRead, preferencesUpdate, smartClassify, copyLoadCommand, t,
}: SkillManagerPanelProps) {
  const sessionId = useSessionId(useSessions)
  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState<SkillRowState[]>([])
  const [preferences, setPreferences] = useState<SkillPreferencesView>({ enabled: [], defaultLoaded: [], categories: [] })
  const [loading, setLoading] = useState(false)
  const [readError, setReadError] = useState<string | undefined>()
  const [noSession, setNoSession] = useState(false)
  const [editing, setEditing] = useState<Editing | undefined>()
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>()
  const [pendingRows, setPendingRows] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<string | undefined>()
  const [newCategoryName, setNewCategoryName] = useState('')
  const [renamingCategory, setRenamingCategory] = useState<{ id: string; name: string; keywords: string } | undefined>()
  const [confirmRemoveCategory, setConfirmRemoveCategory] = useState<SkillCategoryView | undefined>()
  const [selectedCategory, setSelectedCategory] = useState<string | 'all' | 'uncategorized'>('all')

  const enabledSet = useMemo(() => new Set(preferences.enabled), [preferences.enabled])
  const defaultLoadedSet = useMemo(() => new Set(preferences.defaultLoaded), [preferences.defaultLoaded])

  const load = useCallback(async (forSession: SessionId) => {
    setLoading(true)
    setReadError(undefined)
    setNoSession(false)
    try {
      const [entries, prefs] = await Promise.all([list(forSession), preferencesRead(forSession)])
      setSkills(entries.map(entry => ({
        entry,
        categoryIds: prefs.preferences.categories.filter(category => category.skills.includes(entry.name)).map(category => category.id),
      })))
      setPreferences(prefs.preferences)
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code === 'session-not-found') {
        setNoSession(true)
        return
      }
      setReadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [list, preferencesRead])

  useEffect(() => {
    if (open && sessionId !== undefined) void load(sessionId)
  }, [open, sessionId, load])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [open])

  /** Mark one row busy for the duration of an async verb. */
  const withRow = useCallback(async (name: string, action: () => Promise<void>) => {
    setPendingRows(current => new Set(current).add(name))
    try {
      await action()
    } finally {
      setPendingRows(current => {
        const next = new Set(current)
        next.delete(name)
        return next
      })
    }
  }, [])

  /** Persist preferences; on failure roll back to the last known value. */
  const persist = useCallback(async (forSession: SessionId, next: SkillPreferencesView) => {
    const previous = preferences
    setPreferences(next)
    let result: SkillManagerResult
    try {
      result = await preferencesUpdate(forSession, next)
    } catch (error) {
      // Transport failure: roll back so the UI never diverges from the host.
      setPreferences(previous)
      setNotice(t('error.failed', { message: error instanceof Error ? error.message : String(error) }))
      return
    }
    if (!result.ok) {
      setPreferences(previous)
      setNotice(result.message)
      return
    }
    setSkills(current => current.map(row => ({
      ...row,
      entry: { ...row.entry, enabled: next.enabled.length === 0 || next.enabled.includes(row.entry.name) },
      categoryIds: next.categories.filter(category => category.skills.includes(row.entry.name)).map(category => category.id),
    })))
  }, [preferences, preferencesUpdate, t])

  const toggleEnabled = useCallback((name: string) => {
    if (sessionId === undefined) return
    // `enabled` is an allowlist; an empty list means everything is enabled.
    // Toggling one skill off must therefore materialize the full allowlist
    // (every known skill except this one), not just remove this name.
    const allNames = skills.map(row => row.entry.name)
    const currentlyEnabled = enabledSet.size === 0 || enabledSet.has(name)
    const nextEnabled = currentlyEnabled
      ? allNames.filter(entry => entry !== name)
      : [...enabledSet, name]
    void withRow(name, () => persist(sessionId, { ...preferences, enabled: nextEnabled }))
  }, [sessionId, skills, preferences, enabledSet, persist, withRow])

  const toggleDefaultLoaded = useCallback((name: string) => {
    if (sessionId === undefined) return
    const nextDefault = defaultLoadedSet.has(name)
      ? preferences.defaultLoaded.filter(entry => entry !== name)
      : [...preferences.defaultLoaded, name]
    void withRow(name, async () => {
      await persist(sessionId, { ...preferences, defaultLoaded: nextDefault })
      if (!defaultLoadedSet.has(name)) setNotice(t('skill.defaulted'))
    })
  }, [sessionId, preferences, defaultLoadedSet, persist, withRow, t])

  const copyLoad = useCallback((name: string) => {
    void withRow(name, async () => {
      const copied = await copyLoadCommand(name)
      setNotice(copied ? t('skill.loaded', { name }) : t('skill.copyFailed'))
    })
  }, [copyLoadCommand, withRow, t])

  const toggleCategoryMembership = useCallback((skill: string, categoryId: string) => {
    if (sessionId === undefined) return
    const nextCategories = preferences.categories.map(category => (
      category.id === categoryId
        ? { ...category, skills: category.skills.includes(skill)
          ? category.skills.filter(entry => entry !== skill)
          : [...category.skills, skill] }
        : category
    ))
    void withRow(skill, () => persist(sessionId, { ...preferences, categories: nextCategories }))
  }, [sessionId, preferences, persist, withRow])

  const addCategory = useCallback(async () => {
    const name = newCategoryName.trim()
    if (name.length === 0 || sessionId === undefined) return
    const category: SkillCategoryView = { id: toCategoryId(name), name, skills: [] }
    try {
      await persist(sessionId, { ...preferences, categories: [...preferences.categories, category] })
      setNewCategoryName('')
      setNotice(t('cat.added', { name }))
    } catch (error) {
      setNotice(t('error.failed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }, [newCategoryName, sessionId, preferences, persist, t])

  const renameCategory = useCallback(async () => {
    if (renamingCategory === undefined || sessionId === undefined) return
    const name = renamingCategory.name.trim()
    if (name.length === 0) return
    const keywords = renamingCategory.keywords.split(/[,，\s]+/u).map(term => term.trim()).filter(term => term.length > 0)
    await persist(sessionId, {
      ...preferences,
      categories: preferences.categories.map(category => category.id === renamingCategory.id ? { ...category, name, keywords } : category),
    })
    setRenamingCategory(undefined)
  }, [renamingCategory, sessionId, preferences, persist])

  const removeCategory = useCallback(async () => {
    if (confirmRemoveCategory === undefined || sessionId === undefined) return
    await persist(sessionId, {
      ...preferences,
      categories: preferences.categories.filter(category => category.id !== confirmRemoveCategory.id),
    })
    setConfirmRemoveCategory(undefined)
    if (selectedCategory === confirmRemoveCategory.id) setSelectedCategory('all')
  }, [confirmRemoveCategory, sessionId, preferences, persist, selectedCategory])

  const runSmartClassify = useCallback(async () => {
    if (sessionId === undefined) return
    try {
      // First classify: seed default categories when the user has none, and
      // backfill keyword sets onto legacy default categories (created before
      // keywords existed) so matching actually works. Then ask the host to
      // assign every skill to a category by keyword matching.
      let base = preferences
      const upgraded = base.categories.map(category => {
        const defaults = DEFAULT_CATEGORIES.find(entry => entry.id === category.id)
        if (defaults !== undefined && (category.keywords === undefined || category.keywords.length === 0)) {
          return { ...category, keywords: defaults.keywords }
        }
        return category
      })
      if (upgraded.some((category, index) => category !== base.categories[index])) {
        base = { ...base, categories: upgraded }
        await persist(sessionId, base)
      }
      if (base.categories.length === 0) {
        const seeded: SkillCategoryView[] = DEFAULT_CATEGORIES.map(({ id, name, keywords }) => ({ id, name, keywords, skills: [] }))
        base = { ...base, categories: seeded }
        await persist(sessionId, base)
      }
      const suggestions = await smartClassify(sessionId, base.categories)
      const nextCategories = base.categories.map(category => ({ ...category, skills: [] as string[] }))
      for (const suggestion of suggestions) {
        if (suggestion.categoryId === null) continue
        const target = nextCategories.find(category => category.id === suggestion.categoryId)
        if (target !== undefined && !target.skills.includes(suggestion.skill)) target.skills.push(suggestion.skill)
      }
      await persist(sessionId, { ...base, categories: nextCategories })
      const classified = suggestions.filter(suggestion => suggestion.categoryId !== null).length
      setNotice(t('cat.smartDone', { total: suggestions.length, classified }))
    } catch (error) {
      setNotice(t('cat.smartFailed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }, [sessionId, preferences, smartClassify, persist, t])

  const runOpenFolder = useCallback(async () => {
    if (sessionId === undefined) return
    try {
      const folder = await openFolder(sessionId)
      if (folder.opened) setNotice(t('folder.opened'))
      else setNotice(t('folder.noOpener', { path: folder.path }))
    } catch (error) {
      setNotice(t('error.failed', { message: error instanceof Error ? error.message : String(error) }))
    }
  }, [sessionId, openFolder, t])

  const closeEditor = useCallback(() => { setEditing(undefined) }, [])

  const emitError = useCallback((error: unknown) => {
    setNotice(t('error.failed', { message: error instanceof Error ? error.message : String(error) }))
  }, [t])

  const startNew = useCallback(() => {
    setEditing({ kind: 'new', name: '', description: '', whenToUse: '', userOnly: false, disabledModel: false, body: '' })
  }, [])

  const startEdit = useCallback(async (name: string) => {
    if (sessionId === undefined) return
    try {
      const detail = await read(sessionId, name)
      setEditing({
        kind: 'edit', original: name, name: detail.name, description: detail.description,
        whenToUse: detail.whenToUse ?? '', userOnly: !detail.userInvocable, disabledModel: !detail.modelInvocable,
        body: detail.body,
      })
    } catch (error) {
      emitError(error)
    }
  }, [sessionId, read, emitError])

  const save = useCallback(async () => {
    if (editing === undefined || sessionId === undefined) return
    if (editing.name.trim().length === 0) {
      emitError(new Error('name required'))
      return
    }
    try {
      const payload: SkillWritePayload = {
        description: editing.description,
        ...editing.whenToUse.trim().length > 0 ? { whenToUse: editing.whenToUse.trim() } : {},
        userInvocable: !editing.userOnly,
        modelInvocable: !editing.disabledModel,
        body: editing.body,
      }
      const name = editing.name.trim()
      const result = editing.kind === 'new'
        ? await create(sessionId, name, payload)
        : await update(sessionId, editing.original, payload)
      if (!result.ok) {
        setNotice(result.message)
        return
      }
      closeEditor()
      await load(sessionId)
      setNotice(t('state.saved'))
    } catch (error) {
      emitError(error)
    }
  }, [editing, sessionId, create, update, closeEditor, load, t, emitError])

  const runRemove = useCallback(async () => {
    if (confirmDelete === undefined || sessionId === undefined) return
    try {
      const result = await remove(sessionId, confirmDelete)
      if (!result.ok) {
        setNotice(result.message)
      } else {
        setConfirmDelete(undefined)
        await load(sessionId)
        setNotice(t('state.deleted'))
      }
    } catch (error) {
      emitError(error)
    }
  }, [confirmDelete, sessionId, remove, load, t, emitError])

  const filteredSkills = useMemo(() => {
    if (selectedCategory === 'all') return skills
    if (selectedCategory === 'uncategorized') return skills.filter(row => row.categoryIds.length === 0)
    return skills.filter(row => row.categoryIds.includes(selectedCategory))
  }, [skills, selectedCategory])

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <button type="button" className={css.badge} data-skill-manager-badge aria-label={t('panel.open.aria')} onClick={() => { setOpen(true) }}>
        <IconListPenOutline16 />
        {wide && <span className={css.badgeLabel}>{t('panel.trigger')}</span>}
      </button>
      {open && createPortal(
        <div className={css.overlay} role="presentation">
          <div className={css.backdrop} aria-hidden="true" onClick={() => { setOpen(false) }} />
          <div className={css.dialog} role="dialog" aria-modal="true" aria-label={t('panel.title')} onClick={(event) => { event.stopPropagation() }}>
            <header className={css.dialogHeader}>
              <span className={css.dialogTitle}>{t('panel.title')}</span>
              <button type="button" className={css.closeButton} aria-label={t('close')} onClick={() => { setOpen(false) }}>×</button>
            </header>
            <div className={css.toolbar}>
              <button type="button" className={css.iconButton} aria-label={t('action.openFolder')} onClick={() => { void runOpenFolder() }}>
                <IconFolderOpenOutline16 size={14} />
              </button>
              <button type="button" className={css.iconButton} aria-label={t('cat.smart')} onClick={() => { void runSmartClassify() }}>
                <IconSparkle16 size={14} />
              </button>
              <button type="button" className={css.primaryButton} onClick={startNew}>
                <IconPlusOutline16 size={14} />
                {t('action.new')}
              </button>
            </div>
            <div className={css.dialogBody}>
              {notice !== undefined && <p className={css.notice} role="status">{notice}</p>}
              {noSession && <p className={css.note}>{t('panel.noSession')}</p>}
              {readError !== undefined && <p className={css.readError} role="alert">{t('panel.readFailed', { message: readError })}</p>}
              {loading && readError === undefined && <p className={css.note}>{t('panel.loading')}</p>}
              {!loading && readError === undefined && noSession === false
                && editing === undefined && confirmDelete === undefined && confirmRemoveCategory === undefined && (
                <div className={css.split}>
                  <aside className={css.categories} data-skill-manager-categories>
                    <header className={css.categoriesHeader}>
                      <span className={css.subtitle}>{t('cat.title')}</span>
                      <input
                        className={css.input}
                        value={newCategoryName}
                        placeholder={t('cat.nameHint')}
                        onChange={(event) => { setNewCategoryName(event.target.value) }}
                        onKeyDown={(event) => { if (event.key === 'Enter') void addCategory() }}
                      />
                      <button type="button" className={css.ghostButton} disabled={newCategoryName.trim().length === 0} onClick={() => { void addCategory() }}>
                        {t('cat.add')}
                      </button>
                    </header>
                    <ul className={css.categoryList}>
                      <li>
                        <button type="button" className={selectedCategory === 'all' ? css.categoryActive : css.categoryRow} onClick={() => { setSelectedCategory('all') }}>
                          {t('cat.title')}
                        </button>
                      </li>
                      <li>
                        <button type="button" className={selectedCategory === 'uncategorized' ? css.categoryActive : css.categoryRow} onClick={() => { setSelectedCategory('uncategorized') }}>
                          {t('cat.uncategorized')}
                        </button>
                      </li>
                      {preferences.categories.map(category => (
                        <li key={category.id} className={css.categoryItem}>
                          <button
                            type="button"
                            className={selectedCategory === category.id ? css.categoryActive : css.categoryRow}
                            onClick={() => { setSelectedCategory(category.id) }}
                          >
                            <span className={css.categoryName}>{category.name}</span>
                            <span className={css.categoryCount}>{category.skills.length}</span>
                          </button>
                          {renamingCategory?.id === category.id ? (
                            <div className={css.categoryEdit}>
                              <input
                                className={css.input}
                                value={renamingCategory.name}
                                autoFocus
                                placeholder={t('cat.name')}
                                onChange={(event) => { setRenamingCategory({ ...renamingCategory, name: event.target.value }) }}
                                onKeyDown={(event) => { if (event.key === 'Enter') void renameCategory() }}
                              />
                              <input
                                className={css.input}
                                value={renamingCategory.keywords}
                                placeholder={t('cat.keywordsHint')}
                                onChange={(event) => { setRenamingCategory({ ...renamingCategory, keywords: event.target.value }) }}
                                onKeyDown={(event) => { if (event.key === 'Enter') void renameCategory() }}
                              />
                              <button type="button" className={css.ghostButton} onClick={() => { void renameCategory() }}>{t('action.save')}</button>
                            </div>
                          ) : (
                            <div className={css.categoryActions}>
                              <button type="button" className={css.iconButton} aria-label={t('cat.rename')} onClick={() => { setRenamingCategory({ id: category.id, name: category.name, keywords: (category.keywords ?? []).join(', ') }) }}>
                                <IconEditOutline16 size={12} />
                              </button>
                              <button type="button" className={css.iconButton} aria-label={t('cat.remove')} onClick={() => { setConfirmRemoveCategory(category) }}>
                                <IconTrashOutline16 size={12} />
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                      {preferences.categories.length === 0 && <li className={css.note}>{t('cat.empty')}</li>}
                    </ul>
                  </aside>
                  <section className={css.skillList} data-skill-manager-list>
                    {filteredSkills.length === 0 && <p className={css.note}>{t('panel.empty')}</p>}
                    <ul className={css.rows}>
                      {filteredSkills.map(row => {
                        const busy = pendingRows.has(row.entry.name)
                        const enabled = row.entry.enabled
                        const defaultLoaded = defaultLoadedSet.has(row.entry.name)
                        return (
                          <li key={row.entry.name} className={css.row} data-skill-manager-row={row.entry.name}>
                            <div className={css.rowHead}>
                              <span className={css.rowName}>{row.entry.name}</span>
                              <span className={row.entry.editable ? css.managed : css.notManaged}>
                                {row.entry.editable ? t('panel.managed') : t('panel.notManaged')}
                              </span>
                              {defaultLoaded && <span className={css.defaultBadge}>{t('skill.defaulted')}</span>}
                            </div>
                            <div className={css.rowDetail}>
                              <span className={css.rowDescription}>{row.entry.description}</span>
                            </div>
                            <div className={css.rowActions}>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                className={`${css.switch} ${enabled ? css.switchOn : ''}`}
                                aria-label={enabled ? t('skill.disable') : t('skill.enable')}
                                disabled={busy}
                                onClick={() => { toggleEnabled(row.entry.name) }}
                              >
                                <span className={css.switchTrack}><span className={css.switchThumb} /></span>
                                <span className={css.switchLabel}>{t('skill.enable')}</span>
                              </button>
                              <button
                                type="button"
                                className={css.loadButton}
                                aria-label={t('skill.loadToSession')}
                                disabled={busy || !enabled}
                                onClick={() => { copyLoad(row.entry.name) }}
                              >
                                {t('skill.loadToSession')}
                              </button>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={defaultLoaded}
                                className={`${css.switch} ${defaultLoaded ? css.switchOn : ''}`}
                                aria-label={defaultLoaded ? t('skill.defaultOff') : t('skill.defaultOn')}
                                disabled={busy || !enabled}
                                onClick={() => { toggleDefaultLoaded(row.entry.name) }}
                              >
                                <span className={css.switchTrack}><span className={css.switchThumb} /></span>
                                <span className={css.switchLabel}>{t('skill.defaultLabel')}</span>
                              </button>
                              {row.entry.editable && (
                                <button type="button" className={css.iconButton} aria-label={t('action.edit')} disabled={busy} onClick={() => { void startEdit(row.entry.name) }}>
                                  <IconEditOutline16 size={14} />
                                </button>
                              )}
                              {row.entry.editable && (
                                <button type="button" className={css.iconButton} aria-label={t('action.delete')} disabled={busy} onClick={() => { setConfirmDelete(row.entry.name) }}>
                                  <IconTrashOutline16 size={14} />
                                </button>
                              )}
                            </div>
                            {preferences.categories.length > 0 && (
                              <div className={css.categoryMembership}>
                                <span className={css.membershipLabel}>{t('skill.categories')}:</span>
                                {preferences.categories.map(category => (
                                  <label key={category.id} className={css.membershipCheck}>
                                    <input
                                      type="checkbox"
                                      checked={row.categoryIds.includes(category.id)}
                                      disabled={busy}
                                      onChange={() => { toggleCategoryMembership(row.entry.name, category.id) }}
                                    />
                                    {category.name}
                                  </label>
                                ))}
                              </div>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                </div>
              )}
              {editing !== undefined && (
                <div className={css.editorBody}>
                  <Field label={t('form.name')} hint={t('form.name.hint')}>
                    <input
                      className={css.input}
                      value={editing.name}
                      disabled={editing.kind === 'edit'}
                      onChange={(event) => { setEditing({ ...editing, name: event.target.value }) }}
                    />
                  </Field>
                  <Field label={t('form.description')}>
                    <input className={css.input} value={editing.description} onChange={(event) => { setEditing({ ...editing, description: event.target.value }) }} />
                  </Field>
                  <Field label={t('form.whenToUse')}>
                    <input className={css.input} value={editing.whenToUse} onChange={(event) => { setEditing({ ...editing, whenToUse: event.target.value }) }} />
                  </Field>
                  <label className={css.check}>
                    <input type="checkbox" checked={editing.userOnly} onChange={(event) => { setEditing({ ...editing, userOnly: event.target.checked }) }} />
                    {t('form.userOnly')}
                  </label>
                  <label className={css.check}>
                    <input type="checkbox" checked={editing.disabledModel} onChange={(event) => { setEditing({ ...editing, disabledModel: event.target.checked }) }} />
                    {t('form.disabledModel')}
                  </label>
                  <Field label={t('form.body')}>
                    <textarea className={css.textarea} rows={10} value={editing.body} onChange={(event) => { setEditing({ ...editing, body: event.target.value }) }} />
                  </Field>
                  <div className={css.formActions}>
                    <button type="button" className={css.primaryButton} onClick={() => { void save() }}>{t('action.save')}</button>
                    <button type="button" className={css.ghostButton} onClick={closeEditor}>{t('action.cancel')}</button>
                  </div>
                </div>
              )}
              {editing === undefined && confirmDelete !== undefined && (
                <div className={css.editorBody}>
                  <p className={css.confirmMessage}>{t('confirm.deleteMessage', { name: confirmDelete })}</p>
                  <div className={css.formActions}>
                    <button type="button" className={css.dangerButton} onClick={() => { void runRemove() }}>{t('action.delete')}</button>
                    <button type="button" className={css.ghostButton} onClick={() => { setConfirmDelete(undefined) }}>{t('action.cancel')}</button>
                  </div>
                </div>
              )}
              {editing === undefined && confirmRemoveCategory !== undefined && (
                <div className={css.editorBody}>
                  <p className={css.confirmMessage}>{t('cat.confirmRemove', { name: confirmRemoveCategory.name })}</p>
                  <div className={css.formActions}>
                    <button type="button" className={css.dangerButton} onClick={() => { void removeCategory() }}>{t('action.delete')}</button>
                    <button type="button" className={css.ghostButton} onClick={() => { setConfirmRemoveCategory(undefined) }}>{t('action.cancel')}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={css.field}>
      <label className={css.fieldInner}>
        <span className={css.fieldLabel}>{label}</span>
        {children}
      </label>
      {hint !== undefined && <span className={css.fieldHint}>{hint}</span>}
    </div>
  )
}
