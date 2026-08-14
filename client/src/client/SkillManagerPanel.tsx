/** Sidebar skill manager panel: list, create, edit, and delete user-owned skills. */

import { useCallback, useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import {
  IconEditOutline16, IconListPenOutline16, IconPlusOutline16, IconTrashOutline16, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillEntry, SkillWritePayload } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillManagerFace } from './slots.ts'
import css from './SkillManagerPanel.module.css'

/** Full panel props composed by the sidebar footer-action slot. */
export type SkillManagerPanelProps =
  PropsRuntime<'sidebar.footer.action'> & InjectFace<SkillManagerFace> & PropsLocale<'skill-manager'>

type Editing =
  | { kind: 'new'; name: string; description: string; whenToUse: string; userOnly: boolean; disabledModel: boolean; body: string }
  | { kind: 'edit'; original: string; name: string; description: string; whenToUse: string; userOnly: boolean; disabledModel: boolean; body: string }

interface RowState {
  entry: SkillEntry
}

function useSessionId(useSessions: SkillManagerPanelProps['useSessions']): SessionId | undefined {
  const current = useSessions(state => state.current)
  return current
}

/** Present the skill list and per-row edit/delete entry points. */
export function SkillManagerPanel({
  wide,
  useSessions,
  list, read, create, update, remove, t,
}: SkillManagerPanelProps) {
  const sessionId = useSessionId(useSessions)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<RowState[]>([])
  const [loading, setLoading] = useState(false)
  const [readError, setReadError] = useState<string | undefined>()
  const [editing, setEditing] = useState<Editing | undefined>()
  const [confirmDelete, setConfirmDelete] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | undefined>()

  const refresh = useCallback(async (forSession: SessionId) => {
    setLoading(true)
    setReadError(undefined)
    try {
      const skills = await list(forSession)
      setRows(skills.map(entry => ({ entry })))
    } catch (error) {
      setReadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [list])

  useEffect(() => {
    if (open && sessionId !== undefined) void refresh(sessionId)
  }, [open, sessionId, refresh])

  const closeEditor = useCallback(() => {
    setEditing(undefined)
    setNotice(undefined)
  }, [])

  const emitError = useCallback((error: unknown) => {
    setNotice(t('error.failed', { message: error instanceof Error ? error.message : String(error) }))
  }, [t])

  const startNew = useCallback(() => {
    setEditing({ kind: 'new', name: '', description: '', whenToUse: '', userOnly: false, disabledModel: false, body: '' })
  }, [])

  const startEdit = useCallback(async (name: string) => {
    if (sessionId === undefined) return
    setBusy(true)
    try {
      const detail = await read(sessionId, name)
      setEditing({
        kind: 'edit', original: name, name: detail.name, description: detail.description,
        whenToUse: detail.whenToUse ?? '', userOnly: !detail.userInvocable, disabledModel: !detail.modelInvocable,
        body: detail.body,
      })
    } catch (error) {
      emitError(error)
    } finally {
      setBusy(false)
    }
  }, [sessionId, read, emitError])

  const save = useCallback(async () => {
    if (editing === undefined || sessionId === undefined) return
    if (editing.name.trim().length === 0) {
      emitError(new Error('name required'))
      return
    }
    setBusy(true)
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
      await refresh(sessionId)
      setNotice(t('state.saved'))
    } catch (error) {
      emitError(error)
    } finally {
      setBusy(false)
    }
  }, [editing, sessionId, create, update, closeEditor, refresh, t, emitError])

  const runRemove = useCallback(async () => {
    if (confirmDelete === undefined || sessionId === undefined) return
    setBusy(true)
    try {
      const result = await remove(sessionId, confirmDelete)
      if (!result.ok) {
        setNotice(result.message)
      } else {
        setConfirmDelete(undefined)
        await refresh(sessionId)
        setNotice(t('state.deleted'))
      }
    } catch (error) {
      emitError(error)
    } finally {
      setBusy(false)
    }
  }, [confirmDelete, sessionId, remove, refresh, t, emitError])

  if (!editing && confirmDelete === undefined) {
    return (
      <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
        {open && (
          <section className={css.panel} data-skill-manager-panel aria-label={t('panel.title')}>
            <header className={css.header}>
              <span className={css.title}>{t('panel.title')}</span>
              <button type="button" className={css.newButton} onClick={startNew}>
                <IconPlusOutline16 size={14} />
                {t('action.new')}
              </button>
            </header>
            <div className={css.body}>
              {readError !== undefined && <p className={css.readError} role="alert">{t('panel.readFailed', { message: readError })}</p>}
              {loading && readError === undefined && <p className={css.note}>{t('panel.loading')}</p>}
              {!loading && readError === undefined && rows.length === 0 && <p className={css.note}>{t('panel.empty')}</p>}
              <ul className={css.rows}>
                {rows.map(row => (
                  <li key={row.entry.name} className={css.row} data-skill-manager-row={row.entry.name}>
                    <div className={css.rowHead}>
                      <span className={css.rowName}>{row.entry.name}</span>
                      <span
                        className={row.entry.editable ? css.managed : css.notManaged}
                        data-editable={row.entry.editable || undefined}
                      >
                        {row.entry.editable ? t('panel.managed') : t('panel.notManaged')}
                      </span>
                    </div>
                    <div className={css.rowDetail}>
                      <span className={css.rowDescription}>{row.entry.description}</span>
                      <div className={css.rowActions}>
                        {row.entry.editable && (
                          <ActionButton label={t('action.edit')} disabled={busy} onClick={() => void startEdit(row.entry.name)}>
                            <IconEditOutline16 size={14} />
                          </ActionButton>
                        )}
                        {row.entry.editable && (
                          <ActionButton
                            label={t('action.delete')}
                            disabled={busy}
                            onClick={() => { setConfirmDelete(row.entry.name) }}
                          >
                            <IconTrashOutline16 size={14} />
                          </ActionButton>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
        <div className={css.footerButtons}>
          <button
            type="button"
            className={css.badge}
            data-skill-manager-badge
            aria-label={t('panel.open.aria')}
            aria-expanded={open}
            onClick={() => { setOpen(value => !value) }}
          >
            <IconListPenOutline16 />
            {wide && <span className={css.badgeLabel}>{t('panel.trigger')}</span>}
          </button>
        </div>
      </div>
    )
  }

  if (editing !== undefined) {
    return (
      <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
        <section className={css.panel} data-skill-manager-form aria-label={editing.kind === 'new' ? t('form.title.create') : t('form.title.edit')}>
          <header className={css.header}>
            <span className={css.title}>{editing.kind === 'new' ? t('form.title.create') : t('form.title.edit')}</span>
          </header>
          <div className={css.body}>
            <Field label={t('form.name')} hint={t('form.name.hint')}>
              <input
                className={css.input}
                value={editing.name}
                disabled={editing.kind === 'edit' || busy}
                onChange={(event) => { setEditing({ ...editing, name: event.target.value }) }}
              />
            </Field>
            <Field label={t('form.description')}>
              <input
                className={css.input}
                value={editing.description}
                onChange={(event) => { setEditing({ ...editing, description: event.target.value }) }}
              />
            </Field>
            <Field label={t('form.whenToUse')}>
              <input
                className={css.input}
                value={editing.whenToUse}
                onChange={(event) => { setEditing({ ...editing, whenToUse: event.target.value }) }}
              />
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
              <textarea
                className={css.textarea}
                rows={8}
                value={editing.body}
                onChange={(event) => { setEditing({ ...editing, body: event.target.value }) }}
              />
            </Field>
            {notice !== undefined && <p className={css.notice} role="status">{notice}</p>}
            <div className={css.formActions}>
              <button type="button" className={css.primaryButton} disabled={busy} onClick={() => void save()}>
                {t('action.save')}
              </button>
              <button type="button" className={css.ghostButton} disabled={busy} onClick={closeEditor}>
                {t('action.cancel')}
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className={wide ? css.layer : `${css.layer} ${css.rail}`}>
      <section className={css.panel} data-skill-manager-confirm aria-label={t('action.confirmDelete')}>
        <header className={css.header}>
          <span className={css.title}>{t('action.confirmDelete')}</span>
        </header>
        <div className={css.body}>
          <p className={css.confirmMessage}>{t('confirm.deleteMessage', { name: confirmDelete })}</p>
          {notice !== undefined && <p className={css.notice} role="status">{notice}</p>}
          <div className={css.formActions}>
            <button type="button" className={css.dangerButton} disabled={busy} onClick={() => void runRemove()}>
              {t('action.delete')}
            </button>
            <button type="button" className={css.ghostButton} disabled={busy} onClick={() => { setConfirmDelete(undefined) }}>
              {t('action.cancel')}
            </button>
          </div>
        </div>
      </section>
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

function ActionButton({ label, children, ...props }: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button type="button" className={css.actionButton} aria-label={label} {...props}>
        {children}
      </button>
    </Tooltip>
  )
}
