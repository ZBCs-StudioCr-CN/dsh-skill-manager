/** Skill manager plugin, browser half: registers the sidebar skill panel. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SkillDetail, SkillEntry, SkillWritePayload } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillCategoryView, SkillManagerFace, SkillPreferencesView } from './slots.ts'
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { SkillManagerPanel } from './SkillManagerPanel.tsx'
import { en, NS, zh } from './locales.ts'

export type {
  SkillCategoryView, SkillClassificationSuggestion, SkillFolderOpen, SkillManagerFace,
  SkillManagerListItem, SkillManagerResult, SkillPreferencesView,
} from './slots.ts'
export type { SkillManagerPanelProps } from './SkillManagerPanel.tsx'

/** Required services: the sidebar footer-action registry, locale, and the wire client. */
export const inject = ['slots', 'locale', 'connection']

/** Mount every skill-manager browser surface over the wire skill RPCs. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skill-manager: dictionaries')

  const api = (ctx.get('connection') as ConnectionHandle).api.skills

  const face = (): SkillManagerFace => ({
    list: async (sessionId: SessionId): Promise<readonly SkillEntry[]> => {
      const { result } = await api.list({ sessionId, includeDisabled: true })
      if (!result.ok) {
        const error = new Error(`skill.list failed: ${result.error.code}: ${result.error.message}`) as Error & { code?: string }
        error.code = result.error.code
        throw error
      }
      return result.value.skills
    },
    read: async (sessionId: SessionId, name: string): Promise<SkillDetail> => {
      const { result } = await api.read({ sessionId, name })
      if (!result.ok) throw new Error(`skill.read failed: ${result.error.code}: ${result.error.message}`)
      return result.value.skill
    },
    create: async (sessionId: SessionId, name: string, skill: SkillWritePayload) => {
      const { result } = await api.create({ sessionId, name, skill })
      if (result.ok) return { ok: true }
      return { ok: false, message: result.error.message }
    },
    update: async (sessionId: SessionId, name: string, skill: SkillWritePayload) => {
      const { result } = await api.update({ sessionId, name, skill })
      if (result.ok) return { ok: true }
      return { ok: false, message: result.error.message }
    },
    remove: async (sessionId: SessionId, name: string) => {
      const { result } = await api.delete({ sessionId, name })
      if (result.ok) return { ok: true }
      return { ok: false, message: result.error.message }
    },
    openFolder: async (sessionId: SessionId) => {
      const { result } = await api.openFolder({ sessionId })
      if (!result.ok) throw new Error(`skill.openFolder failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
    preferencesRead: async (sessionId: SessionId) => {
      const { result } = await api.preferencesRead({ sessionId })
      if (!result.ok) throw new Error(`skill.preferencesRead failed: ${result.error.code}: ${result.error.message}`)
      return result.value
    },
    preferencesUpdate: async (sessionId: SessionId, preferences: SkillPreferencesView) => {
      const { result } = await api.preferencesUpdate({ sessionId, preferences })
      if (result.ok) return { ok: true }
      return { ok: false, message: result.error.message }
    },
    smartClassify: async (sessionId: SessionId, categories: readonly SkillCategoryView[]) => {
      const { result } = await api.smartClassify({ sessionId, categories })
      if (!result.ok) throw new Error(`skill.smartClassify failed: ${result.error.code}: ${result.error.message}`)
      return result.value.suggestions
    },
    copyLoadCommand: async (name: string) => {
      // The user pastes `/name` into the composer themselves — nothing is sent.
      return await writeClipboard(`/${name} `)
    },
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'skill-manager',
    locale: NS,
    inject: face,
  }, SkillManagerPanel))
}
