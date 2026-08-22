// @vitest-environment jsdom
/**
 * Layout contract of the editor tab: the panel is height-bounded so a long file
 * list scrolls inside the tree instead of pushing the page, and every entry of
 * a large project stays reachable.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '../src/client/EditorView.tsx'
import type { EditorViewProps } from '../src/client/EditorView.tsx'
import { resetMonacoForTests } from '../src/client/monaco.ts'
import editorCss from '../src/client/EditorView.module.css'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

beforeEach(() => {
  resetMonacoForTests()
  ;(window as unknown as { monaco?: unknown }).monaco = {
    editor: {
      defineTheme: () => {},
      create: () => ({
        getValue: () => '',
        setValue: () => {},
        getModel: () => ({ uri: {} }),
        onDidChangeModelContent: () => ({ dispose: () => {} }),
        addCommand: () => {},
        updateOptions: () => {},
        layout: () => {},
        dispose: () => {},
      }),
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

/** A project with more files than any viewport shows at once. */
function largeLevel(count: number) {
  return {
    path: '/w',
    root: '/w',
    entries: Array.from({ length: count }, (_, i) => ({
      name: `file-${String(i).padStart(3, '0')}.ts`,
      path: `/w/file-${String(i).padStart(3, '0')}.ts`,
      directory: false,
    })),
  }
}

/** Render the view over a scripted listing. */
function mount(entries: number) {
  const props = {
    listDir: () => Promise.resolve(largeLevel(entries)),
    readFile: () => Promise.resolve({ path: '/w/a.ts', content: '', version: 'v1' }),
    languageServers: () => Promise.resolve([]),
    writeFile: () => Promise.resolve('v2'),
    t: makeTranslate(zh),
  } as unknown as EditorViewProps
  return render(<EditorView {...props} />)
}

describe('editor layout', () => {
  it('bounds the panel height and scrolls the tree, not the page', () => {
    // The conversation seat grows with its content in an active conversation,
    // so the panel must carry its own ceiling or the tree never scrolls. The
    // rules are asserted from the stylesheet because jsdom applies no CSS.
    // jsdom gives `import.meta.url` a non-file scheme, so the stylesheet is
    // read from the package root the test runner already resolves.
    const sheet = readFileSync(
      resolve(process.cwd(), 'packages/client/ui-editor/src/client/EditorView.module.css'),
      'utf8',
    )
    const root = sheet.slice(sheet.indexOf('.root {'), sheet.indexOf('.tree {'))
    const tree = sheet.slice(sheet.indexOf('.tree {'), sheet.indexOf('.pane {'))

    expect(root).toMatch(/max-height:\s*calc\(100vh/)
    expect(root).toContain('overflow: hidden')
    expect(tree).toMatch(/overflow-y:\s*auto/)
    expect(tree).toContain('min-height: 0')
    // Scrolling stays available while the bar itself takes no width; both
    // engine paths are stated because each ignores the other's declaration.
    expect(tree).toContain('scrollbar-width: none')
    expect(sheet).toContain('.tree::-webkit-scrollbar')
  })

  it('keeps every entry of a large project in the tree', async () => {
    mount(300)

    // The last entry must exist in the DOM: the tree scrolls rather than
    // truncating, so nothing is unreachable.
    expect(await screen.findByText('file-299.ts')).toBeTruthy()
    expect(screen.getByText('file-000.ts')).toBeTruthy()
  })

  it('renders the tree and the buffer pane as siblings, each owning its scroll', async () => {
    const { container } = mount(5)
    await screen.findByText('file-000.ts')

    const root = container.querySelector(`.${editorCss.root}`)
    const tree = container.querySelector(`.${editorCss.tree}`)
    const pane = container.querySelector(`.${editorCss.pane}`)

    expect(tree?.parentElement).toBe(root)
    expect(pane?.parentElement).toBe(root)
  })

  it('keeps the Monaco host mounted while no file is open, so it can measure itself', async () => {
    const { container } = mount(2)
    await screen.findByText('file-000.ts')

    const host = container.querySelector(`.${editorCss.editor}`)

    expect(host).not.toBeNull()
    expect(host?.className).toContain(editorCss.editorHidden)
  })

  it('reveals the Monaco host once a file is open', async () => {
    const { container } = mount(2)
    const entry = await screen.findByText('file-000.ts')

    entry.click()

    await waitFor(() => {
      const host = container.querySelector(`.${editorCss.editor}`)
      expect(host?.className).not.toContain(editorCss.editorHidden)
    })
  })
})
