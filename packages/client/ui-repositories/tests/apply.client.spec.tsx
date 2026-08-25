// @vitest-environment jsdom
/**
 * Registration acceptance on the real framework stack for ui-repositories.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import type { RepositoriesViewInjected } from '../src/client/RepositoriesView.tsx'
import { apply as nodeApply } from '../src/index.ts'
import { zh } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  const slots = new SlotRegistry(ctx)
  ctx.provide('locale', new LocaleRuntime(ctx))
  slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, fiber }
}

describe('ui-repositories apply', () => {
  it('declares only the services it uses, and the node half adds no host behavior', () => {
    expect(inject).toEqual(['slots', 'locale'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the Repositories tab at order 40 with a locale-following label', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view').find(e => e.options.id === 'repositories')!
    expect(entry).toBeDefined()
    expect(entry.options.order).toBe(40)
    expect(entry.locale).toBe('repositories')
    expect(resolveSlotLabel(entry.options.label)).toBe(zh['view.repositories'])
  })

  it('leaves the ring when its fiber disposes', async () => {
    const b = await bench()
    expect(b.slots.entries('conversation.view').map(e => e.options.id)).toContain('repositories')

    await b.fiber.dispose()

    expect(b.slots.entries('conversation.view').map(e => e.options.id)).not.toContain('repositories')
  })

  it('projects sections from child slot entries', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view').find(e => e.options.id === 'repositories')!
    const injected = (entry.inject as unknown as () => RepositoriesViewInjected)()

    expect(injected.sections.list()).toEqual([])

    // Register dummy section
    b.slots.register({
      name: 'conversation.view.repositories.section',
      id: 'local',
      order: 10,
      label: 'Local',
    } as never, () => null)

    const sections = injected.sections.list()
    expect(sections).toEqual([{ id: 'local', label: 'Local', order: 10 }])
    expect(typeof injected.sections.version()).toBe('number')
    expect(typeof injected.sections.subscribe).toBe('function')
  })
})
