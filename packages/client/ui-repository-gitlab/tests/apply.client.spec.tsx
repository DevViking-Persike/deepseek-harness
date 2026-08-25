// @vitest-environment jsdom
/**
 * Registration acceptance on the real framework stack for ui-repository-gitlab.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
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
    children: {
      'conversation.view.repositories.section': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, fiber }
}

describe('ui-repository-gitlab apply', () => {
  it('declares only the services it uses, and the node half adds no host behavior', () => {
    expect(inject).toEqual(['slots', 'locale'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the gitlab section at order 30 with a locale-following label', async () => {
    const b = await bench()
    const entry = b.slots.entries('conversation.view.repositories.section').find(e => e.options.id === 'gitlab')!
    expect(entry).toBeDefined()
    expect(entry.options.order).toBe(30)
    expect(entry.locale).toBe('repository-gitlab')
    expect(resolveSlotLabel(entry.options.label)).toBe(zh['section.gitlab'])
  })

  it('leaves the section ring when its fiber disposes', async () => {
    const b = await bench()
    expect(b.slots.entries('conversation.view.repositories.section').map(e => e.options.id)).toContain('gitlab')

    await b.fiber.dispose()

    expect(b.slots.entries('conversation.view.repositories.section').map(e => e.options.id)).not.toContain('gitlab')
  })
})
