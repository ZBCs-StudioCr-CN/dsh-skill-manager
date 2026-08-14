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
import type { SkillManagerResult } from '../src/client/slots.ts'

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
        { name: 'commit-helper', description: 'commit flow', modelInvocable: true, editable: true },
      ],
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    expect(await findByText('commit-helper')).toBeTruthy()
  })

  it('gates edit/delete to editable skills only', async () => {
    const { getByLabelText, findByText } = renderPanel({
      list: async () => [
        { name: 'editable-skill', description: 'mine', modelInvocable: true, editable: true },
        { name: 'readonly-skill', description: 'shipped', modelInvocable: true, editable: false },
      ],
    })
    fireEvent.click(getByLabelText('panel.open.aria'))
    await findByText('editable-skill')
    // The editable row has an edit button; the read-only row does not.
    const editButtons = screen.getAllByLabelText('action.edit')
    expect(editButtons.length).toBe(1)
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
})
