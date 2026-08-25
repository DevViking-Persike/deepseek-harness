// @vitest-environment jsdom
/**
 * The editor view's own behavior: the tree opens a file, a save carries the
 * version it was read at, and a refused save offers a reload instead of
 * silently discarding either side's work.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorDenied, EditorStale, EditorView } from '../src/client/EditorView.tsx'
import type { EditorViewProps } from '../src/client/EditorView.tsx'
import { resetMonacoForTests } from '../src/client/monaco.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** The editor Monaco would create, scripted so the view can be driven headlessly. */
interface FakeEditor {
  value: string
  listener: (() => void) | undefined
  command: (() => void) | undefined
}

let fake: FakeEditor

beforeEach(() => {
  resetMonacoForTests()
  fake = { value: '', listener: undefined, command: undefined }
  // Monaco is a multi-megabyte distribution served by the host at runtime;
  // these specs assert the view's own logic, so the loader is answered with a
  // scripted editor rather than by fetching it.
  ;(window as unknown as { monaco?: unknown }).monaco = {
    editor: {
      defineTheme: () => {},
      create: (_host: HTMLElement, options: { value: string }) => {
        fake.value = options.value
        return {
          getValue: () => fake.value,
          setValue: (next: string) => { fake.value = next },
          getModel: () => ({ uri: {} }),
          onDidChangeModelContent: (listener: () => void) => {
            fake.listener = listener
            return { dispose: () => {} }
          },
          addCommand: (_key: number, handler: () => void) => { fake.command = handler },
          updateOptions: () => {},
          layout: () => {},
          dispose: () => {},
        }
      },
      setModelLanguage: () => {},
      setTheme: () => {},
    },
    languages: {
      getLanguages: () => [],
      setLanguageConfiguration: () => ({ dispose: () => {} }),
    },
  }
})

/** Interpolate `{name}` placeholders the way the locale service does. */
function makeTranslate(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string>) => {
    const template = dict[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '')
  }
}

const ROOT_LEVEL = {
  path: '/w',
  root: '/w',
  entries: [
    { name: 'src', path: '/w/src', directory: true },
    { name: 'main.ts', path: '/w/main.ts', directory: false },
  ],
}

/** Render the view over scripted wire calls. */
function mount(overrides: Partial<EditorViewProps> = {}) {
  const props = {
    listDir: overrides.listDir ?? (() => Promise.resolve(ROOT_LEVEL)),
    readFile: overrides.readFile
      ?? (() => Promise.resolve({ path: '/w/main.ts', content: 'export const a = 1\n', version: 'v1' })),
    languageServers: () => Promise.resolve([]),
    // No panel is registered in these specs: the ring is empty, so the tab
    // shows its own file tree and draws no switcher.
    panels: { list: () => [], subscribe: () => () => {}, version: () => 0 },
    renderSlot: () => null,
    writeFile: overrides.writeFile ?? (() => Promise.resolve('v2')),
    t: makeTranslate(zh),
  } as unknown as EditorViewProps
  return render(<EditorView {...props} />)
}

describe('opening a file', () => {
  it('invites the operator to choose a file before one is open', async () => {
    mount()

    expect(await screen.findByText(zh['buffer.none'])).toBeTruthy()
  })

  it('lists the workspace level and opens the file that was clicked', async () => {
    const readFile = vi.fn((path: string) => Promise.resolve({ path, content: 'x', version: 'v1' }))
    mount({ readFile })

    fireEvent.click(await screen.findByText('main.ts'))

    await waitFor(() => { expect(readFile).toHaveBeenCalled() })
    expect(readFile).toHaveBeenCalledWith('/w/main.ts', expect.any(AbortSignal))
  })

  it('reports a file it could not open', async () => {
    mount({ readFile: () => Promise.reject(new Error('not text')) })

    fireEvent.click(await screen.findByText('main.ts'))

    expect(await screen.findByText(zh['buffer.failed'].replace('{reason}', 'not text'))).toBeTruthy()
  })

  it('reports a directory level it could not read', async () => {
    mount({ listDir: () => Promise.reject(new Error('no fs seam')) })

    expect(await screen.findByText(zh['tree.failed'].replace('{reason}', 'no fs seam'))).toBeTruthy()
  })
})

describe('saving', () => {
  it('sends the version the file was read at, so the host can refuse a stale write', async () => {
    const writeFile = vi.fn((_path: string, _content: string, _version: string) => Promise.resolve('v2'))
    mount({ writeFile })
    fireEvent.click(await screen.findByText('main.ts'))
    await waitFor(() => { expect(fake.command).toBeDefined() })

    fireEvent.click(screen.getByText(zh.save))

    await waitFor(() => { expect(writeFile).toHaveBeenCalled() })
    expect(writeFile).toHaveBeenCalledWith('/w/main.ts', 'export const a = 1\n', 'v1')
  })

  it('saves through the editor\'s own Ctrl+S command', async () => {
    const writeFile = vi.fn(() => Promise.resolve('v2'))
    mount({ writeFile })
    fireEvent.click(await screen.findByText('main.ts'))
    await waitFor(() => { expect(fake.command).toBeDefined() })

    fake.command?.()

    await waitFor(() => { expect(writeFile).toHaveBeenCalled() })
  })

  it('marks the buffer unsaved once it is edited, and clears that after a save', async () => {
    mount()
    fireEvent.click(await screen.findByText('main.ts'))
    await waitFor(() => { expect(fake.listener).toBeDefined() })

    fake.value = 'export const a = 2\n'
    fake.listener?.()

    expect(await screen.findByText(zh['save.dirty'])).toBeTruthy()
    fireEvent.click(screen.getByText(zh.save))
    expect(await screen.findByText(zh['save.saved'])).toBeTruthy()
  })

  it('carries the new version forward, so a second save is not stale', async () => {
    const writeFile = vi.fn((_path: string, _content: string, _version: string) => Promise.resolve('v2'))
    mount({ writeFile })
    fireEvent.click(await screen.findByText('main.ts'))
    await waitFor(() => { expect(fake.command).toBeDefined() })

    fireEvent.click(screen.getByText(zh.save))
    await waitFor(() => { expect(writeFile).toHaveBeenCalledTimes(1) })
    fireEvent.click(screen.getByText(zh.save))

    await waitFor(() => { expect(writeFile).toHaveBeenCalledTimes(2) })
    // The second save must carry the version the first one returned.
    expect(writeFile).toHaveBeenLastCalledWith('/w/main.ts', 'export const a = 1\n', 'v2')
  })

  it('offers a reload when the host refuses a save the agent superseded', async () => {
    mount({ writeFile: () => Promise.reject(new EditorStale('file changed since it was read')) })
    fireEvent.click(await screen.findByText('main.ts'))
    await waitFor(() => { expect(fake.command).toBeDefined() })

    fireEvent.click(screen.getByText(zh.save))

    expect(await screen.findByText(zh['save.stale'])).toBeTruthy()
    expect(screen.getByText(zh['save.reload'])).toBeTruthy()
  })

  it('re-reads the file from disk when the reload is taken', async () => {
    const readFile = vi.fn((path: string) => Promise.resolve({ path, content: 'x', version: 'v1' }))
    mount({ readFile, writeFile: () => Promise.reject(new EditorStale('changed')) })
    fireEvent.click(await screen.findByText('main.ts'))
    await waitFor(() => { expect(fake.command).toBeDefined() })
    fireEvent.click(screen.getByText(zh.save))
    await screen.findByText(zh['save.stale'])

    fireEvent.click(screen.getByText(zh['save.reload']))

    await waitFor(() => { expect(readFile.mock.calls.length).toBeGreaterThan(1) })
  })

  it('names a sandbox refusal rather than showing its raw message', async () => {
    mount({ writeFile: () => Promise.reject(new EditorDenied('outside the workspace')) })
    fireEvent.click(await screen.findByText('main.ts'))
    await waitFor(() => { expect(fake.command).toBeDefined() })

    fireEvent.click(screen.getByText(zh.save))

    expect(await screen.findByText(zh['save.failed'].replace('{reason}', zh['save.denied']))).toBeTruthy()
  })
})
