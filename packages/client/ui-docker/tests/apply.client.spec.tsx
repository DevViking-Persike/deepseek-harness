// @vitest-environment jsdom
/**
 * Registration acceptance on the real framework stack: the plugin fiber puts
 * Docker into a real SlotRegistry conversation-view ring behind Trajectory,
 * its injected wire calls narrow the host's docker refusals, and fiber
 * disposal removes the tab (the HMR-safety proof).
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
import type { DockerViewInjected } from '../src/client/DockerView.tsx'
import { DockerUnreachable } from '../src/client/DockerView.tsx'
import { apply as nodeApply } from '../src/index.ts'
import { zh } from '../src/client/locales.ts'

// The locale service reads its initial locale from the browser; this spec
// asserts the shipped Chinese copy, so it states the browser it assumes.
usePinnedBrowserLanguages('zh-CN')

afterEach(cleanup)

const SID = 's1' as SessionId

const CONTAINER = {
  id: 'c1', name: 'web', image: 'nginx:1.27', state: 'running', status: 'Up 3 hours',
  ports: ['8080->80/tcp'], createdAt: '2026-01-01T00:00:00Z',
}
const IMAGE = { id: 'i1', tags: ['nginx:1.27'], size: 1024, createdAt: '2026-01-01T00:00:00Z' }

/** Unary answer helpers mirroring the wire client's `{ result }` envelope. */
const ok = <T,>(value: T) => Promise.resolve({ rpcId: 'r', result: { ok: true as const, value } })
const err = (code: string, message: string) =>
  Promise.resolve({ rpcId: 'r', result: { ok: false as const, error: { code, message, details: {} } } })

/**
 * Real-stack bench: root Context, a real ring declaration, and the plugin
 * fiber. A `docker` of `undefined` models a client artifact that predates the
 * docker domain and therefore exposes no such member.
 */
async function bench(docker: Record<string, unknown> | undefined) {
  const ctx = new Context()
  const slots = new SlotRegistry(ctx)
  ctx.provide('connection', { api: docker === undefined ? {} : { docker }, isLoopback: true } as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  // Compose actions reach the session's agent, so the bench supplies the
  // binding face the registration reads.
  ctx.provide('sessions', {
    binding: () => ({ session: { prompt: () => Promise.resolve({ ok: true, value: { accepted: true } }) } }),
  } as never)
  // The conversation entry's role: the ring must be declared before riders land.
  slots.register({
    name: 'root',
    children: { 'conversation.view': { kind: 'list', scope: 'session' } },
  } as never, () => null)
  slots.register({ name: 'conversation.view', id: 'chat', order: 0, label: 'Chat' } as never, () => null)
  slots.register({ name: 'conversation.view', id: 'trajectory', order: 10, label: 'Trajectory' } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, fiber }
}

/** The injected face of the registered Docker entry. */
function injectedOf(slots: SlotRegistry): DockerViewInjected {
  const entry = slots.entries('conversation.view').find(e => e.options.id === 'docker')!
  return (entry.inject as unknown as (sessionId: SessionId) => DockerViewInjected)(SID)
}

describe('ui-docker apply', () => {
  it('declares only the services it uses, and the node half adds no host behavior', () => {
    expect(inject).toEqual(['slots', 'connection', 'sessions', 'locale'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('registers the Docker tab after Trajectory with a locale-following label', async () => {
    const b = await bench({})
    const ids = b.slots.entries('conversation.view').map(e => e.options.id)
    expect(ids).toEqual(['chat', 'trajectory', 'docker'])
    const entry = b.slots.entries('conversation.view').find(e => e.options.id === 'docker')!
    expect(entry.options.order).toBe(20)
    expect(entry.locale).toBe('docker')
    expect(resolveSlotLabel(entry.options.label)).toBe(zh['view.docker'])
  })

  it('leaves the ring when its fiber disposes', async () => {
    const b = await bench({})
    expect(b.slots.entries('conversation.view').map(e => e.options.id)).toContain('docker')
    await b.fiber.dispose()
    expect(b.slots.entries('conversation.view').map(e => e.options.id)).toEqual(['chat', 'trajectory'])
  })

  it('reads containers and images in one inventory call, stopped containers included', async () => {
    const listContainers = vi.fn(() => ok({ containers: [CONTAINER] }))
    const listImages = vi.fn(() => ok({ images: [IMAGE] }))
    const b = await bench({ listContainers, listImages })
    const signal = new AbortController().signal
    await expect(injectedOf(b.slots).loadInventory(signal)).resolves.toEqual({
      containers: [CONTAINER], images: [IMAGE],
    })
    expect(listContainers).toHaveBeenCalledWith({ all: true }, signal)
    expect(listImages).toHaveBeenCalledWith({}, signal)
  })

  it('narrows a docker-unavailable refusal to the calm empty-state marker', async () => {
    const b = await bench({
      listContainers: () => err('docker-unavailable', 'no engine'),
      listImages: () => ok({ images: [] }),
      logs: () => err('docker-unavailable', 'no engine'),
    })
    const signal = new AbortController().signal
    const injected = injectedOf(b.slots)
    await expect(injected.loadInventory(signal)).rejects.toBeInstanceOf(DockerUnreachable)
    await expect(injected.loadLogs('c1', signal)).rejects.toBeInstanceOf(DockerUnreachable)
  })

  it('surfaces every other refusal as an ordinary failure carrying its code', async () => {
    const b = await bench({
      listContainers: () => ok({ containers: [] }),
      listImages: () => err('internal', 'image listing failed'),
      logs: () => err('internal', 'log read failed'),
    })
    const signal = new AbortController().signal
    const injected = injectedOf(b.slots)
    await expect(injected.loadInventory(signal)).rejects.toThrow('internal: image listing failed')
    await expect(injected.loadLogs('c1', signal)).rejects.toThrow('internal: log read failed')
  })

  it('reads one container\'s logs with the host truncation flag intact', async () => {
    const logs = vi.fn(() => ok({ container: 'c1', content: 'line', truncated: true }))
    const b = await bench({ logs })
    const signal = new AbortController().signal
    await expect(injectedOf(b.slots).loadLogs('c1', signal)).resolves.toEqual({ content: 'line', truncated: true })
    expect(logs).toHaveBeenCalledWith({ container: 'c1' }, signal)
  })
})

describe('stale client artifact', () => {
  it('registers the tab even when the loaded client carries no docker domain', async () => {
    const b = await bench(undefined)

    expect(b.slots.entries('conversation.view').map(e => e.options.id)).toContain('docker')
  })

  it('refuses every call as unreachable instead of failing on the property read', async () => {
    const b = await bench(undefined)
    const injected = injectedOf(b.slots)
    const signal = new AbortController().signal

    // Only the wire reads go through `api.docker`. The Compose actions reach
    // the session's agent instead, so a client bundle without the docker
    // domain can still start and stop a project.
    for (const call of [
      () => injected.loadInventory(signal),
      () => injected.loadLogs('web', signal),
      () => injected.browseCompose(undefined, signal),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(DockerUnreachable)
    }
    await expect(injected.composeUp('/srv/c.yml')).resolves.toBeUndefined()
    await expect(injected.composeDown('/srv/c.yml')).resolves.toBeUndefined()
  })
})
