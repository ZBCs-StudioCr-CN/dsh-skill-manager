// @vitest-environment jsdom
/**
 * ui-skill-manager browser half: dictionary registration + the panel's user
 * contract — editable gating on list rows, the create/edit form, and the
 * create/update/delete RPC wiring — driven directly with realistic props.
 */
import { describe, expect, it, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { SkillManagerPanel, type SkillManagerPanelProps } from '../src/client/SkillManagerPanel.tsx'
import type { SkillManagerResult, SkillPreferencesView } from '../src/client/slots.ts'

afterEach(() => { cleanup() })

const t = (key: string, params?: Record<string, unknown>) => key + (params ? JSON.stringify(params) : '')

function renderPanel(props: Partial<SkillManagerPanelProps>) {
  const base = {
    wide: true,
    useSessions: (selector: (s: { current: string | undefined }) => unknown) => selector({ current: 's1' }),
    useWorkspaces: () => [], // v8 ignore -- presentation smoke only
    t,
    list: async () => [],
    read: async () => ({ name: 'a', description: 'A', userInvocable: true, modelInvocable: true, body: 'b' }),
    create: async (): Promise<SkillManagerResult> => ({ ok: true }),
    update: async (): Promise<SkillManagerResult> => ({ ok: true }),
    remove: async (): Promise<SkillManagerResult> => ({ ok: true }),
    openFolder: async () => ({ opened: true, path: '/fixture/skills' }),
    preferencesRead: async () => ({ preferences: { enabled: [], defaultLoaded: [], categories: [] }, path: '/fixture/skill-preferences.json' }),
    preferencesUpdate: async (): Promise<SkillManagerResult> => ({ ok: true }),
    smartClassify: async () => [],
    copyLoadCommand: async () => true,
  } as unknown as SkillManagerPanelProps
  return render(<SkillManagerPanel {...base} {...props} />)
}

describe('apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('registers its locale dictionaries', async () => {
    const ctx = new Context()
    const dictionaries: string[] = []
    // The plugin requires the slots and locale services to mount; a bare
    // SlotRegistry satisfies slots (no slot declaration is needed — the
    // sidebar.footer.action injection simply waits on it).
    new SlotRegistry(ctx).register({
      name: 'root',
    } as never, () => null)
    ctx.provide('locale', {
      register(namespace: string) {
        dictionaries.push(namespace)
        return () => {}
      },
      bind: () => (key: string) => key,
    })
    ctx.provide('connection', {
      api: {
        skills: {
          list: async () => ({ result: { ok: true, value: { skills: [] } } }),
          read: async () => ({ result: { ok: true, value: { skill: { name: 'x', description: '', modelInvocable: true, userInvocable: true, body: '' } } } }),
          create: async () => ({ result: { ok: true, value: { name: 'x', path: '/x' } } }),
          update: async () => ({ result: { ok: true, value: { name: 'x', path: '/x' } } }),
          delete: async () => ({ result: { ok: true, value: { deleted: true } } }),
        },
      },
    })
    new TestRemote(ctx)
    await ctx.plugin({ inject: [...inject], apply }).await()
    expect(dictionaries).toContain('skill-manager')
  })
})

describe('SkillManagerPanel', () => {
  it('shows the trigger button and opens the panel to list skills', async () => {
    const { getByLabelText, findByText } = renderPanel({
      list: async () => [
        { name: 'commit-helper', description: 'commit flow', modelInvocable: true, editable: true, enabled: true },
      ],
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    expect(await findByText('commit-helper')).toBeTruthy()
  })

  it('gates edit/delete to editable skills only', async () => {
    const { getByLabelText, findByText } = renderPanel({
      list: async () => [
        { name: 'editable-skill', description: 'mine', modelInvocable: true, editable: true, enabled: true },
        { name: 'readonly-skill', description: 'shipped', modelInvocable: true, editable: false, enabled: true },
      ],
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    await findByText('editable-skill')
    // The editable row has an edit button; the read-only row does not.
    const editButtons = screen.getAllByLabelText('action.edit')
    expect(editButtons.length).toBe(1)
  })

  it('toggles enablement through the switch with a materialized allowlist', async () => {
    const saved: SkillPreferencesView[] = []
    const { getByLabelText, findByText } = renderPanel({
      list: async () => [
        { name: 'skill-a', description: 'a', modelInvocable: true, editable: true, enabled: true },
        { name: 'skill-b', description: 'b', modelInvocable: true, editable: true, enabled: true },
      ],
      preferencesUpdate: async (_sid: string, preferences: SkillPreferencesView) => {
        saved.push({
          enabled: [...preferences.enabled],
          defaultLoaded: [...preferences.defaultLoaded],
          categories: preferences.categories.map(category => ({ ...category, skills: [...category.skills] })),
        })
        return { ok: true }
      },
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    const row = (await findByText('skill-a')).closest('li')!
    fireEvent.click(row.querySelector('[role="switch"]')!)
    await waitFor(() => { expect(saved.length).toBe(1) })
    // Turning skill-a off materializes the allowlist of every other skill.
    expect(saved[0]?.enabled).toEqual(['skill-b'])
  })

  it('toggles the global default-load switch', async () => {
    const saved: SkillPreferencesView[] = []
    const { getByLabelText, findByText } = renderPanel({
      list: async () => [
        { name: 'skill-a', description: 'a', modelInvocable: true, editable: true, enabled: true },
      ],
      preferencesUpdate: async (_sid: string, preferences: SkillPreferencesView) => {
        saved.push({
          enabled: [...preferences.enabled],
          defaultLoaded: [...preferences.defaultLoaded],
          categories: preferences.categories.map(category => ({ ...category, skills: [...category.skills] })),
        })
        return { ok: true }
      },
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    const row = (await findByText('skill-a')).closest('li')!
    // First switch is enablement, the second is the default-load switch.
    const switches = row.querySelectorAll('[role="switch"]')
    fireEvent.click(switches[1]!)
    await waitFor(() => { expect(saved.length).toBe(1) })
    expect(saved[0]?.defaultLoaded).toEqual(['skill-a'])
  })

  it('guides the user when the current session has no attached host session', async () => {
    const { getByLabelText, findByText } = renderPanel({
      list: async () => {
        const error = new Error('skill.list failed: session-not-found: nope') as Error & { code?: string }
        error.code = 'session-not-found'
        throw error
      },
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    expect(await findByText(/panel\.noSession/)).toBeTruthy()
  })

  it('opens the create form and persists via create', async () => {
    const created: Array<{ name: string }> = []
    const { getByLabelText, findByLabelText, getAllByText } = renderPanel({
      list: async () => [],
      create: async (_sessionId: string, name: string) => {
        created.push({ name })
        return { ok: true }
      },
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    fireEvent.click(getAllByText('action.new')[0]!)
    const nameInput = await findByLabelText('form.name')
    fireEvent.change(nameInput, { target: { value: 'brand-new' } })
    fireEvent.click(getAllByText('action.save')[0]!)
    await waitFor(() => { expect(created.length).toBe(1) })
    expect(created[0]?.name).toBe('brand-new')
  })

  it('opens the skills folder through the host and reports the no-opener path', async () => {
    const calls: string[] = []
    const { getByLabelText, getAllByLabelText, findByText } = renderPanel({
      list: async () => [],
      openFolder: async () => {
        calls.push('openFolder')
        return { opened: false, path: 'C:\\Users\\me\\.dsh\\skills' }
      },
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    fireEvent.click(getAllByLabelText('action.openFolder')[0]!)
    await waitFor(() => { expect(calls.length).toBe(1) })
    expect(await findByText(/folder\.noOpener/)).toBeTruthy()
  })

  it('adds a category and persists it through preferencesUpdate', async () => {
    const saved: SkillPreferencesView[] = []
    const { getByLabelText, getAllByText, findByPlaceholderText } = renderPanel({
      list: async () => [],
      preferencesUpdate: async (_sid: string, preferences: SkillPreferencesView) => {
        saved.push({
          enabled: [...preferences.enabled],
          defaultLoaded: [...preferences.defaultLoaded],
          categories: preferences.categories.map(category => ({ ...category, skills: [...category.skills] })),
        })
        return { ok: true }
      },
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    const input = await findByPlaceholderText(/cat\.nameHint/)
    fireEvent.change(input, { target: { value: '设计' } })
    fireEvent.click(getAllByText('cat.add')[0]!)
    await waitFor(() => { expect(saved.length).toBe(1) })
    expect(saved[0]?.categories[0]?.name).toBe('设计')
  })

  it('applies smart classification suggestions via preferencesUpdate', async () => {
    const saved: SkillPreferencesView[] = []
    const { getByLabelText, getAllByLabelText } = renderPanel({
      list: async () => [
        { name: 'ui-design', description: 'design tokens', modelInvocable: true, editable: true, enabled: true },
      ],
      preferencesRead: async () => ({
        preferences: { enabled: [], defaultLoaded: [], categories: [{ id: 'design', name: '设计', skills: [] }] },
        path: '/fixture/skill-preferences.json',
      }),
      preferencesUpdate: async (_sid: string, preferences: SkillPreferencesView) => {
        saved.push({
          enabled: [...preferences.enabled],
          defaultLoaded: [...preferences.defaultLoaded],
          categories: preferences.categories.map(category => ({ ...category, skills: [...category.skills] })),
        })
        return { ok: true }
      },
      smartClassify: async () => [{ skill: 'ui-design', categoryId: 'design' }],
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    await waitFor(() => { expect(getAllByLabelText('cat.smart').length).toBe(1) })
    fireEvent.click(getAllByLabelText('cat.smart')[0]!)
    // First persist backfills keywords onto the legacy default category, the
    // second applies the suggestions.
    await waitFor(() => { expect(saved.length).toBe(2) })
    expect(saved[0]?.categories[0]?.keywords?.length).toBeGreaterThan(0)
    expect(saved[1]?.categories[0]?.skills).toEqual(['ui-design'])
  })

  it('copies the /name invocation to the clipboard via copyLoadCommand', async () => {
    const copied: string[] = []
    const { getByLabelText, findByText } = renderPanel({
      list: async () => [
        { name: 'commit-helper', description: 'commit flow', modelInvocable: true, editable: true, enabled: true },
      ],
      copyLoadCommand: async (name: string) => {
        copied.push(name)
        return true
      },
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    fireEvent.click((await findByText('commit-helper')).closest('li')!.querySelector('[aria-label="skill.loadToSession"]')!)
    await waitFor(() => { expect(copied).toEqual(['commit-helper']) })
  })

  it('seeds default categories when smart-classifying with no categories yet', async () => {
    const saved: SkillPreferencesView[] = []
    const { getByLabelText, getAllByLabelText } = renderPanel({
      list: async () => [
        { name: 'ui-design', description: 'design tokens', modelInvocable: true, editable: true, enabled: true },
      ],
      preferencesUpdate: async (_sid: string, preferences: SkillPreferencesView) => {
        saved.push({
          enabled: [...preferences.enabled],
          defaultLoaded: [...preferences.defaultLoaded],
          categories: preferences.categories.map(category => ({ ...category, skills: [...category.skills] })),
        })
        return { ok: true }
      },
      smartClassify: async () => [{ skill: 'ui-design', categoryId: 'design' }],
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    await waitFor(() => { expect(getAllByLabelText('cat.smart').length).toBe(1) })
    fireEvent.click(getAllByLabelText('cat.smart')[0]!)
    // First persist seeds the default category set, the second applies the suggestions.
    await waitFor(() => { expect(saved.length).toBe(2) })
    expect(saved[0]!.categories.length).toBeGreaterThan(0)
    // Seeded categories carry smart-classify keywords so matching actually works.
    expect(saved[0]!.categories[0]!.keywords?.length).toBeGreaterThan(0)
    expect(saved[1]!.categories.find(category => category.id === 'design')!.skills).toEqual(['ui-design'])
  })
})
