// @vitest-environment jsdom
/**
 * Wheel ownership: the conversation column is itself a scroll container and
 * would consume a wheel gesture made over the editor. The tree keeps the
 * gesture while it can still move and releases it at its own edges, and the
 * Monaco host keeps it away from the page entirely.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

/** Render the view over a listing long enough to scroll. */
function mount() {
  const props = {
    listDir: () => Promise.resolve({
      path: '/w',
      root: '/w',
      entries: Array.from({ length: 60 }, (_, i) => ({
        name: `f${String(i)}.ts`, path: `/w/f${String(i)}.ts`, directory: false,
      })),
    }),
    readFile: () => Promise.resolve({ path: '/w/f0.ts', content: '', version: 'v1' }),
    languageServers: () => Promise.resolve([]),
    writeFile: () => Promise.resolve('v2'),
    t: makeTranslate(zh),
  } as unknown as EditorViewProps
  return render(<EditorView {...props} />)
}

/** Give an element a scrollable geometry; jsdom lays nothing out on its own. */
function makeScrollable(el: HTMLElement, scrollTop: number, clientHeight = 100, scrollHeight = 400) {
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true })
  el.scrollTop = scrollTop
}

/** Dispatch a cancelable wheel event and report whether the handler claimed it. */
function wheel(el: HTMLElement, deltaY: number): { defaultPrevented: boolean } {
  const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true })
  el.dispatchEvent(event)
  return { defaultPrevented: event.defaultPrevented }
}

describe('file tree wheel', () => {
  it('claims the gesture and scrolls itself while it can still move', async () => {
    const { container } = mount()
    await screen.findByText('f0.ts')
    const tree = container.querySelector<HTMLElement>(`.${editorCss.tree}`)!
    makeScrollable(tree, 0)

    const result = wheel(tree, 120)

    expect(result.defaultPrevented).toBe(true)
    expect(tree.scrollTop).toBe(120)
  })

  it('scrolls back up the same way', async () => {
    const { container } = mount()
    await screen.findByText('f0.ts')
    const tree = container.querySelector<HTMLElement>(`.${editorCss.tree}`)!
    makeScrollable(tree, 200)

    wheel(tree, -120)

    expect(tree.scrollTop).toBe(80)
  })

  it('releases the gesture at its top edge, so the page can still scroll up', async () => {
    const { container } = mount()
    await screen.findByText('f0.ts')
    const tree = container.querySelector<HTMLElement>(`.${editorCss.tree}`)!
    makeScrollable(tree, 0)

    expect(wheel(tree, -120).defaultPrevented).toBe(false)
  })

  it('releases the gesture at its bottom edge', async () => {
    const { container } = mount()
    await screen.findByText('f0.ts')
    const tree = container.querySelector<HTMLElement>(`.${editorCss.tree}`)!
    makeScrollable(tree, 300)

    expect(wheel(tree, 120).defaultPrevented).toBe(false)
  })

  it('ignores a horizontal-only gesture', async () => {
    const { container } = mount()
    await screen.findByText('f0.ts')
    const tree = container.querySelector<HTMLElement>(`.${editorCss.tree}`)!
    makeScrollable(tree, 50)

    expect(wheel(tree, 0).defaultPrevented).toBe(false)
    expect(tree.scrollTop).toBe(50)
  })
})

describe('editor wheel', () => {
  it('keeps the gesture from reaching the conversation column', async () => {
    const { container } = mount()
    const seen = vi.fn()
    container.addEventListener('wheel', seen)
    ;(await screen.findByText('f0.ts')).click()
    const host = container.querySelector<HTMLElement>(`.${editorCss.editor}`)!
    await waitFor(() => { expect(host.className).not.toContain(editorCss.editorHidden) })

    host.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))

    // Monaco scrolls its own viewport; what matters is that the column above
    // never sees the gesture and therefore cannot scroll the page instead.
    expect(seen).not.toHaveBeenCalled()
  })
})
