/** Injected face for the skill manager sidebar footer-action panel. */

import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillDetail, SkillEntry, SkillWritePayload } from '@deepseek-ai/dsh-client-connection/client'

/** Outcome of a skill authoring verb surfaced to the panel. */
export type SkillManagerResult = { ok: true } | { ok: false; message: string }

/** Live skill catalog row plus whether the host considers it editable. */
export type SkillManagerListItem = SkillEntry

/**
 * Registrant-private injected share for the skill manager panel: every verb is
 * a callback closed over the apply context's connection, so the presentation
 * component never touches ctx or the RPC client directly.
 */
export interface SkillManagerFace {
  /** Reload the user-invocable skill catalog for the given session. */
  list: (sessionId: SessionId) => Promise<readonly SkillEntry[]>
  /** Read one user-owned skill's full editable content. */
  read: (sessionId: SessionId, name: string) => Promise<SkillDetail>
  /** Create a user-owned skill. */
  create: (sessionId: SessionId, name: string, payload: SkillWritePayload) => Promise<SkillManagerResult>
  /** Update a user-owned skill. */
  update: (sessionId: SessionId, name: string, payload: SkillWritePayload) => Promise<SkillManagerResult>
  /** Delete a user-owned skill. */
  remove: (sessionId: SessionId, name: string) => Promise<SkillManagerResult>
}
