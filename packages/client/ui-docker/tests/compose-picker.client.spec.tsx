// @vitest-environment jsdom
/**
 * ComposePicker presentation behavior over direct props: browsing host
 * directories filtered to compose candidates, selecting a file by its host
 * path, running the project up and down, and the failure and empty states.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { DockerComposeBrowse } from '@deepseek-ai/dsh-api-remotes/client'
import { ComposePicker } from '../src/client/ComposePicker.tsx'
import type { ComposePickerProps } from '../src/client/ComposePicker.tsx'
import { DockerUnreachable } from '../src/client/DockerView.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const HOME_LEVEL: DockerComposeBrowse = {
  path: '/home/dev',
  home: '/home/dev',
  crumbs: [
    { name: '/', path: '/', directory: true, hidden: false },
    { name: 'home', path: '/home', directory: true, hidden: false },
    { name: 'dev', path: '/home/dev', directory: true, hidden: false },
  ],
  entries: [
    { name: 'shop', path: '/home/dev/shop', directory: true, hidden: false },
    { name: 'docker-compose.yml', path: '/home/dev/docker-compose.yml', directory: false, hidden: false },
  ],
  truncated: false,
}


/** Render the picker with the injected wire calls a real registration supplies. */
function mount(overrides: Partial<ComposePickerProps> = {}) {
  const props: ComposePickerProps = {
    browseCompose: overrides.browseCompose ?? (() => Promise.resolve(HOME_LEVEL)),
    composeUp: overrides.composeUp ?? (() => Promise.resolve()),
    composeDown: overrides.composeDown ?? (() => Promise.resolve()),
    onClose: overrides.onClose ?? (() => {}),
    t: makeTranslate(zh),
  }
  return render(<ComposePicker {...props} />)
}

describe('ComposePicker browsing', () => {
  it('opens on the host home level and lists directories and compose files', async () => {
    mount()

    expect(await screen.findByText('shop')).toBeTruthy()
    expect(screen.getByText('docker-compose.yml')).toBeTruthy()
  })

  it('asks the host for its home directory when nothing is selected yet', async () => {
    const browseCompose = vi.fn(() => Promise.resolve(HOME_LEVEL))
    mount({ browseCompose })

    await screen.findByText('shop')

    expect(browseCompose).toHaveBeenCalledWith(undefined, expect.any(AbortSignal))
  })

  it('descends into a directory by its host path rather than joining segments itself', async () => {
    const browseCompose = vi.fn(() => Promise.resolve(HOME_LEVEL))
    mount({ browseCompose })

    fireEvent.click(await screen.findByText('shop'))

    expect(browseCompose).toHaveBeenLastCalledWith('/home/dev/shop', expect.any(AbortSignal))
  })

  it('jumps to an ancestor through its breadcrumb', async () => {
    const browseCompose = vi.fn(() => Promise.resolve(HOME_LEVEL))
    mount({ browseCompose })

    fireEvent.click(await screen.findByText('home'))

    expect(browseCompose).toHaveBeenLastCalledWith('/home', expect.any(AbortSignal))
  })

  it('states an empty level rather than leaving the dialog blank', async () => {
    mount({ browseCompose: () => Promise.resolve({ ...HOME_LEVEL, entries: [] }) })

    expect(await screen.findByText(zh['compose.empty'])).toBeTruthy()
  })

  it('says the level was cut when the host capped its rows', async () => {
    mount({ browseCompose: () => Promise.resolve({ ...HOME_LEVEL, truncated: true }) })

    expect(await screen.findByText(zh['compose.truncated'])).toBeTruthy()
  })

  it('reports an unreadable directory without closing the dialog', async () => {
    mount({ browseCompose: () => Promise.reject(new Error('permission denied')) })

    expect(await screen.findByText(zh['compose.browseFailed'].replace('{reason}', 'permission denied'))).toBeTruthy()
    expect(screen.getByText(zh['compose.title'])).toBeTruthy()
  })

  it('abandons an in-flight browse when the dialog unmounts', async () => {
    let captured: AbortSignal | undefined
    const { unmount } = mount({
      browseCompose: (_path, signal) => {
        captured = signal
        return new Promise<DockerComposeBrowse>(() => {})
      },
    })
    await screen.findByText(zh['compose.loading'])

    unmount()

    expect(captured!.aborted).toBe(true)
  })
})

describe('ComposePicker lifecycle', () => {
  it('offers no lifecycle action until a compose file is selected', async () => {
    mount()
    await screen.findByText('docker-compose.yml')

    expect(screen.getByText(zh['compose.none'])).toBeTruthy()
    expect(screen.getByText(zh['compose.up']).closest('button')!.disabled).toBe(true)
    expect(screen.getByText(zh['compose.down']).closest('button')!.disabled).toBe(true)
  })

  it('selects a compose file by its absolute host path, which is what the CLI needs', async () => {
    mount()

    fireEvent.click(await screen.findByText('docker-compose.yml'))

    expect(screen.getByText(zh['compose.selected'].replace('{file}', '/home/dev/docker-compose.yml'))).toBeTruthy()
    expect(screen.getByText(zh['compose.up']).closest('button')!.disabled).toBe(false)
  })

  it('starts the selected project and reports the settled containers', async () => {
    const composeUp = vi.fn(() => Promise.resolve())
    mount({ composeUp })

    fireEvent.click(await screen.findByText('docker-compose.yml'))
    fireEvent.click(screen.getByText(zh['compose.up']))

    expect(composeUp).toHaveBeenCalledWith('/home/dev/docker-compose.yml')
    // The run itself is a logged tool call in Chat, so the dialog confirms the
    // request reached the agent rather than reporting containers itself.
    expect(await screen.findByText(zh['compose.sent.up'])).toBeTruthy()
  })

  it('stops the selected project through the down action', async () => {
    const composeDown = vi.fn(() => Promise.resolve())
    mount({ composeDown })

    fireEvent.click(await screen.findByText('docker-compose.yml'))
    fireEvent.click(screen.getByText(zh['compose.down']))

    expect(composeDown).toHaveBeenCalledWith('/home/dev/docker-compose.yml')
    expect(await screen.findByText(zh['compose.sent.down'])).toBeTruthy()
  })

  it('locks browsing and both actions while a lifecycle call runs', async () => {
    mount({ composeUp: () => new Promise<void>(() => {}) })

    fireEvent.click(await screen.findByText('docker-compose.yml'))
    fireEvent.click(screen.getByText(zh['compose.up']))

    expect(await screen.findByText(zh['compose.starting'])).toBeTruthy()
    expect(screen.getByText(zh['compose.up']).closest('button')!.disabled).toBe(true)
    expect(screen.getByText(zh['compose.down']).closest('button')!.disabled).toBe(true)
    expect(screen.getByText('shop').closest('button')!.disabled).toBe(true)
  })

  it('reports a rejected project with the engine text and leaves the selection intact', async () => {
    mount({ composeUp: () => Promise.reject(new Error('port 5432 already allocated')) })

    fireEvent.click(await screen.findByText('docker-compose.yml'))
    fireEvent.click(screen.getByText(zh['compose.up']))

    expect(await screen.findByText(
      zh['compose.runFailed'].replace('{reason}', 'port 5432 already allocated'),
    )).toBeTruthy()
    expect(screen.getByText(zh['compose.selected'].replace('{file}', '/home/dev/docker-compose.yml'))).toBeTruthy()
  })

  it('reports an unreachable engine through the same lifecycle failure line', async () => {
    mount({ composeUp: () => Promise.reject(new DockerUnreachable('no engine')) })

    fireEvent.click(await screen.findByText('docker-compose.yml'))
    fireEvent.click(screen.getByText(zh['compose.up']))

    expect(await screen.findByText(zh['compose.runFailed'].replace('{reason}', 'no engine'))).toBeTruthy()
  })

  it('closes on the close control', async () => {
    const onClose = vi.fn()
    mount({ onClose })

    fireEvent.click(await screen.findByText(zh['compose.close']))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
