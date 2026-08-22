// @vitest-environment jsdom
/**
 * Registration acceptance on the real framework stack: the plugin fiber puts
 * Editor into a real SlotRegistry conversation-view ring behind Docker, its
 * injected wire calls narrow the host's editor refusals, and fiber disposal
 * removes the tab (the HMR-safety proof).
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import type { EditorViewInjected } from '../src/client/EditorView.tsx'
import { EditorDenied, EditorStale, EditorUnavailable } from '../src/client/EditorView.tsx'
import { apply as nodeApply } from '../src/index.ts'
import { zh } from '../src/client/locales.ts'

// The locale service reads its initial locale from the browser; this spec
// asserts the shipped Chinese copy, so it states the browser it assumes.
usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)

const SID = 's1' as SessionId

/** Unary answer helpers mirroring the wire client's `{ result }` envelope. */
const ok = <T,>(value: T) => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value } })
const err = (code: string, message: string) =>
  Promise.resolve({ rpcId: 'r', result: { ok: false as const, error: { code, message, details: {} } } })

/** Real-stack bench: root Context, a real ring declaration, and the plugin fiber. */
async function bench(editor: Record<string, unknown> | undefined) {
  const ctx = new Context()
  const slots = new SlotRegistry(ctx)
  ctx.provide('connection', { api: editor === undefined ? {} : { editor }, isLoopback: true } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  slots.register({ name: 'conversation.view', id: 'chat', order: 0, label: 'Chat' } as never, () => null)
  slots.register({ name: 'conversation.view', id: 'docker', order: 20, label: 'Docker' } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, fiber }
}

/** The injected face of the registered Editor entry. */
function injectedOf(slots: SlotRegistry): EditorViewInjected {
  const entry = slots.entries('conversation.view').find(e => e.options.id === 'editor')!
  return (entry.inject as unknown as (sessionId: SessionId) => EditorViewInjected)(SID)
}

describe('ui-editor apply', () => {
  it('declares only the services it uses, and the node half adds no host behavior', () => {
    expect(inject).toEqual(['slots', 'connection', 'locale'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the Editor tab after Docker with a locale-following label', async () => {
    const b = await bench({})
    const ids = b.slots.entries('conversation.view').map(e => e.options.id)
    expect(ids).toEqual(['chat', 'docker', 'editor'])
    const entry = b.slots.entries('conversation.view').find(e => e.options.id === 'editor')!
    expect(entry.options.order).toBe(30)
    expect(entry.locale).toBe('editor')
    expect(resolveSlotLabel(entry.options.label)).toBe(zh['view.editor'])
  })

  it('leaves the ring when its fiber disposes', async () => {
    const b = await bench({})
    expect(b.slots.entries('conversation.view').map(e => e.options.id)).toContain('editor')

    await b.fiber.dispose()

    expect(b.slots.entries('conversation.view').map(e => e.options.id)).toEqual(['chat', 'docker'])
  })

  it('addresses every call to the tab\'s own session', async () => {
    const listDir = vi.fn(() => ok({ path: '/w', root: '/w', entries: [] }))
    const readFile = vi.fn(() => ok({ path: '/w/a.ts', content: 'x', version: 'v1' }))
    const writeFile = vi.fn(() => ok({ path: '/w/a.ts', version: 'v2' }))
    const b = await bench({ listDir, readFile, writeFile })
    const injected = injectedOf(b.slots)
    const signal = new AbortController().signal

    await injected.listDir(undefined, signal)
    await injected.readFile('/w/a.ts', signal)
    await injected.writeFile('/w/a.ts', 'y', 'v1')

    expect(listDir).toHaveBeenCalledWith({ sessionId: SID }, signal)
    expect(readFile).toHaveBeenCalledWith({ sessionId: SID, path: '/w/a.ts' }, signal)
    expect(writeFile).toHaveBeenCalledWith({ sessionId: SID, path: '/w/a.ts', content: 'y', version: 'v1' })
  })

  it('returns the freshness token a later save must present', async () => {
    const b = await bench({
      readFile: () => ok({ path: '/w/a.ts', content: 'x', version: 'v1' }),
      writeFile: () => ok({ path: '/w/a.ts', version: 'v2' }),
    })
    const injected = injectedOf(b.slots)

    await expect(injected.readFile('/w/a.ts', new AbortController().signal))
      .resolves.toMatchObject({ version: 'v1' })
    await expect(injected.writeFile('/w/a.ts', 'y', 'v1')).resolves.toBe('v2')
  })

  it('narrows a stale save so the view can offer a reload', async () => {
    const b = await bench({ writeFile: () => err('editor-stale', 'file changed since it was read') })

    await expect(injectedOf(b.slots).writeFile('/w/a.ts', 'y', 'v1')).rejects.toBeInstanceOf(EditorStale)
  })

  it('narrows a sandbox refusal apart from an ordinary failure', async () => {
    const b = await bench({
      writeFile: () => err('editor-denied', 'outside the workspace'),
      readFile: () => err('internal', 'disk exploded'),
    })
    const injected = injectedOf(b.slots)

    await expect(injected.writeFile('/w/a.ts', 'y', 'v1')).rejects.toBeInstanceOf(EditorDenied)
    await expect(injected.readFile('/w/a.ts', new AbortController().signal))
      .rejects.toThrow('internal: disk exploded')
  })

  it('narrows an absent filesystem seam', async () => {
    const b = await bench({ listDir: () => err('editor-unavailable', 'no fs seam') })

    await expect(injectedOf(b.slots).listDir(undefined, new AbortController().signal))
      .rejects.toBeInstanceOf(EditorUnavailable)
  })

  it('registers the tab even when the loaded client carries no editor domain', async () => {
    const b = await bench(undefined)
    expect(b.slots.entries('conversation.view').map(e => e.options.id)).toContain('editor')

    await expect(injectedOf(b.slots).listDir(undefined, new AbortController().signal))
      .rejects.toBeInstanceOf(EditorUnavailable)
  })
})
