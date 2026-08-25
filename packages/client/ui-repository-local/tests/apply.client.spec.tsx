// @vitest-environment jsdom
/**
 * Registration acceptance on the real framework stack for ui-repository-local.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import type { RepositoryLocalInjected } from '../src/client/RepositoryLocalSection.tsx'
import { GitUnavailable } from '../src/client/RepositoryLocalSection.tsx'
import { apply as nodeApply } from '../src/index.ts'
import { zh } from '../src/client/locales.ts'

usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)

const ok = <T,>(value: T) => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value } })
const err = (code: string, message: string) =>
  Promise.resolve({ rpcId: 'r', result: { ok: false as const, error: { code, message, details: {} } } })

async function bench(git: Record<string, unknown> | undefined) {
  const ctx = new Context()
  const slots = new SlotRegistry(ctx)
  ctx.provide('connection', { api: git === undefined ? {} : { git }, isLoopback: true } as never)
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

describe('ui-repository-local apply', () => {
  it('declares only the services it uses, and the node half adds no host behavior', () => {
    expect(inject).toEqual(['slots', 'connection', 'locale'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the local section at order 10 with a locale-following label', async () => {
    const b = await bench({})
    const entry = b.slots.entries('conversation.view.repositories.section').find(e => e.options.id === 'local')!
    expect(entry).toBeDefined()
    expect(entry.options.order).toBe(10)
    expect(entry.locale).toBe('repository-local')
    expect(resolveSlotLabel(entry.options.label)).toBe(zh['section.local'])
  })

  it('leaves the section ring when its fiber disposes', async () => {
    const b = await bench({})
    expect(b.slots.entries('conversation.view.repositories.section').map(e => e.options.id)).toContain('local')

    await b.fiber.dispose()

    expect(b.slots.entries('conversation.view.repositories.section').map(e => e.options.id)).not.toContain('local')
  })

  it('invokes git RPC calls through injected functions', async () => {
    const listRepositories = vi.fn(() => ok({ repositories: [{ root: '/repo', name: 'repo', workspaceTitle: 'Main', submodule: false }] }))
    const status = vi.fn(() => ok({ root: '/repo', branch: 'main', upstream: 'origin/main', ahead: 1, behind: 0, changes: [], truncated: false }))

    const b = await bench({ listRepositories, status })
    const entry = b.slots.entries('conversation.view.repositories.section').find(e => e.options.id === 'local')!
    const injected = (entry.inject as unknown as () => RepositoryLocalInjected)()
    const signal = new AbortController().signal

    const repos = await injected.listRepositories(signal)
    expect(repos).toHaveLength(1)
    expect(listRepositories).toHaveBeenCalledWith({}, signal)

    const st = await injected.status('/repo', signal)
    expect(st.branch).toBe('main')
    expect(status).toHaveBeenCalledWith({ root: '/repo' }, signal)
  })

  it('throws GitUnavailable when git RPC is unavailable', async () => {
    const listRepositories = vi.fn(() => err('git-unavailable', 'Git not mounted'))
    const b = await bench({ listRepositories })
    const entry = b.slots.entries('conversation.view.repositories.section').find(e => e.options.id === 'local')!
    const injected = (entry.inject as unknown as () => RepositoryLocalInjected)()
    const signal = new AbortController().signal

    await expect(injected.listRepositories(signal)).rejects.toThrow(GitUnavailable)
  })

  it('throws GitUnavailable when connection API has no git domain', async () => {
    const b = await bench(undefined)
    const entry = b.slots.entries('conversation.view.repositories.section').find(e => e.options.id === 'local')!
    const injected = (entry.inject as unknown as () => RepositoryLocalInjected)()
    const signal = new AbortController().signal

    await expect(injected.listRepositories(signal)).rejects.toThrow(GitUnavailable)
  })
})
