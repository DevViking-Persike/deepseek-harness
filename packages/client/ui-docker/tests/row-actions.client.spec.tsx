// @vitest-environment jsdom
/**
 * Each container row carries its own lifecycle controls: the start/stop seat
 * offers only the action that applies, restart needs a running container, and
 * a shell is handed to the agent rather than opened in this tab.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DockerView } from '../src/client/DockerView.tsx'
import type { DockerInventory, DockerViewProps } from '../src/client/DockerView.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const RUNNING = {
  id: 'c1', name: 'web', image: 'nginx:1.27', state: 'running', status: 'Up 3 hours',
  ports: [], createdAt: '2026-01-01T00:00:00Z',
}
const EXITED = {
  id: 'c2', name: 'zitadel-local', image: 'zitadel:v4', state: 'exited', status: 'Exited (255)',
  ports: [], createdAt: '2026-01-01T00:00:00Z',
}

/** Interpolate `{name}` placeholders the way the locale service does. */
function makeTranslate(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string>) => {
    const template = dict[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '')
  }
}

/** Render the view over a scripted inventory and the two row actions. */
function mount(overrides: {
  containers?: readonly unknown[]
  controlContainer?: DockerViewProps['controlContainer']
  openShell?: DockerViewProps['openShell']
} = {}) {
  const containers = overrides.containers ?? [RUNNING, EXITED]
  const props = {
    loadInventory: (): Promise<DockerInventory> =>
      Promise.resolve({ containers, images: [] } as unknown as DockerInventory),
    loadLogs: () => Promise.resolve({ content: 'log line', truncated: false }),
    engineStatus: () => Promise.resolve({ running: true, startable: false, installable: false }),
    startEngine: () => Promise.resolve(),
    installEngine: () => Promise.resolve(),
    controlContainer: overrides.controlContainer ?? (() => Promise.resolve()),
    openShell: overrides.openShell ?? (() => Promise.resolve()),
    browseCompose: () => Promise.resolve({ path: '/h', home: '/h', crumbs: [], entries: [], truncated: false }),
    composeUp: () => Promise.resolve(),
    composeDown: () => Promise.resolve(),
    t: makeTranslate(zh),
  } as unknown as DockerViewProps
  return render(<DockerView {...props} />)
}

/** The action buttons of the row whose container name is `name`. */
function rowActions(name: string): HTMLButtonElement[] {
  const row = screen.getByText(name).closest('li')
  return [...row!.querySelectorAll('button')] as HTMLButtonElement[]
}

/** One row action button by its visible label. */
function action(name: string, label: string): HTMLButtonElement {
  const found = rowActions(name).find(button => button.textContent === label)
  if (found === undefined) throw new Error(`row "${name}" has no "${label}" action`)
  return found
}

describe('container row actions', () => {
  it('offers stop for a running container and start for a stopped one', async () => {
    mount()
    await screen.findByText('web')

    expect(action('web', zh['action.stop'])).toBeTruthy()
    expect(rowActions('web').some(b => b.textContent === zh['action.start'])).toBe(false)
    expect(action('zitadel-local', zh['action.start'])).toBeTruthy()
    expect(rowActions('zitadel-local').some(b => b.textContent === zh['action.stop'])).toBe(false)
  })

  it('offers restart only for a container that is running', async () => {
    mount()
    await screen.findByText('web')

    expect(action('web', zh['action.restart']).disabled).toBe(false)
    expect(action('zitadel-local', zh['action.restart']).disabled).toBe(true)
  })

  it('stops a running container through the seam', async () => {
    const controlContainer = vi.fn(() => Promise.resolve())
    mount({ controlContainer })
    await screen.findByText('web')

    fireEvent.click(action('web', zh['action.stop']))

    expect(controlContainer).toHaveBeenCalledWith('c1', 'stop')
  })

  it('starts a stopped container through the seam', async () => {
    const controlContainer = vi.fn(() => Promise.resolve())
    mount({ controlContainer })
    await screen.findByText('zitadel-local')

    fireEvent.click(action('zitadel-local', zh['action.start']))

    expect(controlContainer).toHaveBeenCalledWith('c2', 'start')
  })

  it('restarts a running container through the seam', async () => {
    const controlContainer = vi.fn(() => Promise.resolve())
    mount({ controlContainer })
    await screen.findByText('web')

    fireEvent.click(action('web', zh['action.restart']))

    expect(controlContainer).toHaveBeenCalledWith('c1', 'restart')
  })

  it('locks only the acting row while its action runs', async () => {
    mount({ controlContainer: () => new Promise<void>(() => {}) })
    await screen.findByText('web')

    fireEvent.click(action('web', zh['action.stop']))

    expect(action('web', zh['action.stop']).disabled).toBe(true)
    // A second container is unaffected: the actions address one container each.
    expect(action('zitadel-local', zh['action.start']).disabled).toBe(false)
  })

  it('reports a refused action without losing the row', async () => {
    mount({ controlContainer: () => Promise.reject(new Error('port still bound')) })
    await screen.findByText('web')

    fireEvent.click(action('web', zh['action.stop']))

    expect(await screen.findByText(zh['action.failed'].replace('{reason}', 'port still bound'))).toBeTruthy()
    expect(action('web', zh['action.stop']).disabled).toBe(false)
  })

  it('expands the log panel from the row\'s logs action', async () => {
    mount()
    await screen.findByText('web')

    fireEvent.click(action('web', zh['action.logs']))

    expect(await screen.findByText('log line')).toBeTruthy()
  })

  it('hands a shell request to the agent for a running container only', async () => {
    const openShell = vi.fn(() => Promise.resolve())
    mount({ openShell })
    await screen.findByText('web')

    expect(action('zitadel-local', zh['action.shell']).disabled).toBe(true)
    fireEvent.click(action('web', zh['action.shell']))

    expect(openShell).toHaveBeenCalledWith('c1')
  })

  it('reports a refused shell request', async () => {
    mount({ openShell: () => Promise.reject(new Error('session is unavailable')) })
    await screen.findByText('web')

    fireEvent.click(action('web', zh['action.shell']))

    expect(await screen.findByText(zh['action.failed'].replace('{reason}', 'session is unavailable'))).toBeTruthy()
  })
})
