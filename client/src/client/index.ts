/** Skill manager plugin, browser half: registers the sidebar skill panel. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SkillDetail, SkillEntry, SkillWritePayload } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillManagerFace } from './slots.ts'
import { SkillManagerPanel } from './SkillManagerPanel.tsx'
import { en, NS, zh } from './locales.ts'

export type { SkillManagerFace, SkillManagerListItem, SkillManagerResult } from './slots.ts'
export type { SkillManagerPanelProps } from './SkillManagerPanel.tsx'

/** Required services: the sidebar footer-action registry, locale, and the wire client. */
export const inject = ['slots', 'locale', 'connection']

/** Mount every skill-manager browser surface over the wire skill RPCs. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-skill-manager: dictionaries')

  const api = (ctx.get('connection') as ConnectionHandle).api.skills

  const face = (): SkillManagerFace => ({
    list: async (sessionId: SessionId): Promise<readonly SkillEntry[]> => {
      const { result } = await api.list({ sessionId })
      if (!result.ok) throw new Error(`skill.list failed: ${result.error.code}: ${result.error.message}`)
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
  })

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'skill-manager',
    locale: NS,
    inject: face,
  }, SkillManagerPanel))
}
