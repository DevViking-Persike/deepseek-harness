// @vitest-environment jsdom
/**
 * DockerView presentation behavior over direct props: the container and image
 * listings, the two empty states, the unreachable-engine state (calm text, not
 * an error box), log expansion, and refresh/unmount cancellation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { DockerContainerEntry, DockerImageEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { DockerUnreachable, DockerView } from '../src/client/DockerView.tsx'
import type { DockerInventory, DockerLogs, DockerViewProps } from '../src/client/DockerView.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const RUNNING: DockerContainerEntry = {
  id: 'c1', name: 'web', image: 'nginx:1.27', state: 'running', status: 'Up 3 hours',
  project: 'shop', service: 'frontend', ports: ['8080->80/tcp'], createdAt: '2026-01-01T00:00:00Z',
}
const EXITED: DockerContainerEntry = {
  id: 'c2', name: 'worker', image: 'alpine:3', state: 'exited', status: 'Exited (1) 2 minutes ago',
  ports: [], createdAt: '2026-01-01T00:00:00Z',
}
const IMAGES: readonly DockerImageEntry[] = [
  { id: 'i1', tags: ['nginx:1.27'], size: 5 * 1024 * 1024, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'i2', tags: [], size: 512, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'i3', tags: ['big:1'], size: 3 * 1024 * 1024 * 1024, createdAt: '2026-01-01T00:00:00Z' },
]

/** Render the view with the standard kit the outlet would bake plus the two wire calls. */
function mount(overrides: {
  loadInventory?: DockerViewProps['loadInventory']
  loadLogs?: DockerViewProps['loadLogs']
  engineStatus?: DockerViewProps['engineStatus']
} = {}) {
  const props = {
    loadInventory: overrides.loadInventory
      ?? ((): Promise<DockerInventory> => Promise.resolve({ containers: [RUNNING, EXITED], images: IMAGES })),
    loadLogs: overrides.loadLogs
      ?? ((): Promise<DockerLogs> => Promise.resolve({ content: 'log line', truncated: false })),
    // An unreachable engine makes the view ask what can be done about it; the
    // default answers "nothing", which is the plain empty state.
    engineStatus: overrides.engineStatus
      ?? (() => Promise.resolve({ running: false, startable: false, installable: false })),
    startEngine: () => Promise.resolve(),
    installEngine: () => Promise.resolve(),
    t: makeTranslate(zh),
  } as unknown as DockerViewProps
  return render(<DockerView {...props} />)
}

describe('DockerView', () => {
  it('lists containers with state, image, compose pair, ports, and images with sizes', async () => {
    mount()
    await screen.findByText('web')
    expect(screen.getByText('running')).toBeTruthy()
    // The container's image reference and the image row's tag read alike.
    expect(screen.getAllByText('nginx:1.27')).toHaveLength(2)
    expect(screen.getByText('shop/frontend')).toBeTruthy()
    expect(screen.getByText(zh['containers.ports'].replace('{ports}', '8080->80/tcp'))).toBeTruthy()
    // A stopped container is listed too: it is what an operator opens this tab for.
    expect(screen.getByText('worker')).toBeTruthy()
    expect(screen.getByText('Exited (1) 2 minutes ago')).toBeTruthy()
    expect(screen.getByText(zh['images.untagged'])).toBeTruthy()
    expect(screen.getByText('5.0 MB')).toBeTruthy()
    expect(screen.getByText('512 B')).toBeTruthy()
    expect(screen.getByText('3.0 GB')).toBeTruthy()
  })

  it('shows both empty states when the engine knows nothing', async () => {
    mount({ loadInventory: () => Promise.resolve({ containers: [], images: [] }) })
    await screen.findByText(zh['containers.empty'])
    expect(screen.getByText(zh['images.empty'])).toBeTruthy()
  })

  it('renders an unreachable engine as calm empty copy, with no alert', async () => {
    mount({ loadInventory: () => Promise.reject(new DockerUnreachable('no engine')) })
    await screen.findByText(zh.unavailable)
    expect(screen.queryByRole('alert')).toBeNull()
    // The listing sections stay away entirely; there is nothing to report on.
    expect(screen.queryByText(zh.containers)).toBeNull()
  })

  it('reports any other read failure with its reason', async () => {
    mount({ loadInventory: () => Promise.reject(new Error('internal: boom')) })
    await screen.findByText(zh.failed.replace('{reason}', 'internal: boom'))
  })

  it('reveals a container\'s logs on click and collapses them on a second click', async () => {
    const loadLogs = vi.fn(() => Promise.resolve({ content: 'first line', truncated: false }))
    mount({ loadLogs })
    const row = await screen.findByText('web')
    fireEvent.click(row)
    await screen.findByText('first line')
    expect(loadLogs).toHaveBeenCalledWith('c1', expect.any(AbortSignal))
    fireEvent.click(row)
    await waitFor(() => { expect(screen.queryByText('first line')).toBeNull() })
  })

  it('says so when a container produced no output, and marks a truncated read', async () => {
    const { unmount } = mount({ loadLogs: () => Promise.resolve({ content: '', truncated: false }) })
    fireEvent.click(await screen.findByText('web'))
    await screen.findByText(zh['logs.empty'])
    unmount()
    mount({ loadLogs: () => Promise.resolve({ content: 'tail', truncated: true }) })
    fireEvent.click(await screen.findByText('web'))
    await screen.findByText(zh['logs.truncated'])
  })

  it('reports a failed log read inside the expanded panel', async () => {
    mount({ loadLogs: () => Promise.reject(new Error('read failed')) })
    fireEvent.click(await screen.findByText('web'))
    await screen.findByText(zh['logs.failed'].replace('{reason}', 'read failed'))
  })

  it('refresh reloads the inventory and aborts the superseded requests', async () => {
    const signals: AbortSignal[] = []
    const loadInventory = vi.fn((signal: AbortSignal): Promise<DockerInventory> => {
      signals.push(signal)
      return Promise.resolve({ containers: [RUNNING], images: [] })
    })
    mount({ loadInventory })
    await screen.findByText('web')
    fireEvent.click(screen.getByText(zh.refresh))
    await waitFor(() => { expect(loadInventory).toHaveBeenCalledTimes(2) })
    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
  })

  it('aborts the in-flight inventory read when the view unmounts', async () => {
    let captured: AbortSignal | undefined
    const { unmount } = mount({
      loadInventory: (signal) => {
        captured = signal
        return new Promise<DockerInventory>(() => {})
      },
    })
    await screen.findByText(zh.loading)
    unmount()
    expect(captured!.aborted).toBe(true)
  })

  it('names a compose project alone when the container carries no service label', async () => {
    const { service: _service, ...withoutService } = RUNNING
    const projectOnly = { ...withoutService, project: 'shop' }
    mount({ loadInventory: () => Promise.resolve({ containers: [projectOnly], images: [] }) })
    await screen.findByText('shop')
  })

  it('reports a non-Error rejection by its string form', async () => {
    // The rule wants an Error; a non-Error rejection is precisely the input
    // under test, since a transport can reject with any value.
    // eslint-disable-next-line typescript/prefer-promise-reject-errors
    mount({ loadInventory: () => Promise.reject('engine said no') })
    await screen.findByText(zh.failed.replace('{reason}', 'engine said no'))
  })

  it('drops an inventory settlement that lands after its request was aborted', async () => {
    // Both arms of the post-abort fence: a read the view already abandoned
    // must not write state after its controller aborted. Refresh is disabled
    // while a read is in flight, so unmount is the reachable abort here.
    for (const settle of [
      (resolve: (v: DockerInventory) => void, _reject: (e: unknown) => void) =>
        ({ finish: () => { resolve({ containers: [EXITED], images: [] }) } }),
      (_resolve: (v: DockerInventory) => void, reject: (e: unknown) => void) =>
        ({ finish: () => { reject(new Error('stale failure')) } }),
    ]) {
      let pending: { finish: () => void } | undefined
      const { unmount } = mount({
        loadInventory: () => new Promise<DockerInventory>((resolve, reject) => {
          pending = settle(resolve, reject)
        }),
      })
      await screen.findByText(zh.loading)

      unmount()
      pending!.finish()
      await Promise.resolve()

      // The abandoned read painted nothing: no row and no failure survived it.
      expect(screen.queryByText('worker')).toBeNull()
      expect(screen.queryByText('stale failure')).toBeNull()
    }
  })

  it('drops a log settlement that lands after its request was superseded', async () => {
    for (const settle of [
      (resolve: (v: DockerLogs) => void, _reject: (e: unknown) => void) =>
        ({ finish: () => { resolve({ content: 'stale log', truncated: false }) } }),
      (_resolve: (v: DockerLogs) => void, reject: (e: unknown) => void) =>
        ({ finish: () => { reject(new Error('stale log failure')) } }),
    ]) {
      let pending: { finish: () => void } | undefined
      const { unmount } = mount({
        loadLogs: () => new Promise<DockerLogs>((resolve, reject) => {
          pending = settle(resolve, reject)
        }),
      })
      fireEvent.click(await screen.findByText('web'))
      await screen.findByText(zh['logs.loading'])
      // Collapsing the row aborts its read; the late settlement must not
      // resurrect a panel the user already closed.
      fireEvent.click(screen.getByText('web'))
      pending!.finish()
      await Promise.resolve()
      expect(screen.queryByText('stale log')).toBeNull()
      expect(screen.queryByText(zh['logs.failed'].replace('{reason}', 'stale log failure'))).toBeNull()
      unmount()
    }
  })
})
