/** Injected face for the skill manager sidebar footer-action panel. */

import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { SkillDetail, SkillEntry, SkillWritePayload } from '@deepseek-ai/dsh-client-connection/client'

/** Outcome of a skill authoring verb surfaced to the panel. */
export type SkillManagerResult = { ok: true } | { ok: false; message: string }

/** Result of opening the user skills root in the host file manager. */
export interface SkillFolderOpen {
  /** Whether the deployment handed the folder to the native file manager. */
  readonly opened: boolean
  /** The host-resolved user skills root (displayed when no opener exists). */
  readonly path: string
}

/** One user category; a skill may belong to several categories. */
export interface SkillCategoryView {
  readonly id: string
  readonly name: string
  /** Optional extra terms smart classification matches against (the name always counts). */
  readonly keywords?: readonly string[]
  readonly skills: readonly string[]
}

/** The whole persisted preference set. */
export interface SkillPreferencesView {
  /** Enabled skill names; empty means everything is enabled. */
  readonly enabled: readonly string[]
  /** Skill names auto-loaded into every new/opened session (global default). */
  readonly defaultLoaded: readonly string[]
  /** Category definitions and member lists. */
  readonly categories: readonly SkillCategoryView[]
}

/** Suggested category assignment produced by smart classification. */
export interface SkillClassificationSuggestion {
  readonly skill: string
  readonly categoryId: string | null
}

/** Live skill catalog row plus whether the host considers it editable. */
export type SkillManagerListItem = SkillEntry

/**
 * Registrant-private injected share for the skill manager panel: every verb is
 * a callback closed over the apply context's connection, so the presentation
 * component never touches ctx or the RPC client directly.
 */
export interface SkillManagerFace {
  /** Reload the skill catalog for the given session; includes disabled skills so the UI can toggle them. */
  list: (sessionId: SessionId) => Promise<readonly SkillEntry[]>
  /** Read one user-owned skill's full editable content. */
  read: (sessionId: SessionId, name: string) => Promise<SkillDetail>
  /** Create a user-owned skill. */
  create: (sessionId: SessionId, name: string, payload: SkillWritePayload) => Promise<SkillManagerResult>
  /** Update a user-owned skill. */
  update: (sessionId: SessionId, name: string, payload: SkillWritePayload) => Promise<SkillManagerResult>
  /** Delete a user-owned skill. */
  remove: (sessionId: SessionId, name: string) => Promise<SkillManagerResult>
  /** Open the user skills root in the host file manager. */
  openFolder: (sessionId: SessionId) => Promise<SkillFolderOpen>
  /** Read the user skill preferences (enablement + categories). */
  preferencesRead: (sessionId: SessionId) => Promise<{ preferences: SkillPreferencesView; path: string }>
  /** Persist the full user skill preferences. */
  preferencesUpdate: (sessionId: SessionId, preferences: SkillPreferencesView) => Promise<SkillManagerResult>
  /** Ask the host to suggest category assignments for every skill. */
  smartClassify: (sessionId: SessionId, categories: readonly SkillCategoryView[]) => Promise<readonly SkillClassificationSuggestion[]>
  /** Copy the `/name` invocation into the clipboard so the user can paste it into the composer (no message is sent). */
  copyLoadCommand: (name: string) => Promise<boolean>
}
