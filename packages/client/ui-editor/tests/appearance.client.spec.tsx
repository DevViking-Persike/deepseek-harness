// @vitest-environment jsdom
/**
 * Appearance: every tree row carries a type mark, and the editor's syntax
 * theme is derived from the harness palette rather than a second, competing
 * one.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '../src/client/EditorView.tsx'
import type { EditorViewProps } from '../src/client/EditorView.tsx'
import { languageOf, resetMonacoForTests } from '../src/client/monaco.ts'
import { FILE_ICON, FOLDER_ICON, FOLDER_OPEN_ICON, iconFor } from '../src/client/file-icons.ts'
import { buildTheme, EDITOR_THEME, normalizeColor, resolvePalette, tokenRules } from '../src/client/theme.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

let defined: { name: string; theme: unknown } | undefined

beforeEach(() => {
  resetMonacoForTests()
  defined = undefined
  ;(window as unknown as { monaco?: unknown }).monaco = {
    editor: {
      defineTheme: (name: string, theme: unknown) => { defined = { name, theme } },
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

/** Render the view over a listing that mixes directories and known file types. */
function mount() {
  const props = {
    listDir: () => Promise.resolve({
      path: '/w',
      root: '/w',
      entries: [
        { name: 'src', path: '/w/src', directory: true },
        { name: 'main.ts', path: '/w/main.ts', directory: false },
        { name: 'package.json', path: '/w/package.json', directory: false },
        { name: 'notes.unknownext', path: '/w/notes.unknownext', directory: false },
      ],
    }),
    readFile: () => Promise.resolve({ path: '/w/main.ts', content: 'const a = 1\n', version: 'v1' }),
    languageServers: () => Promise.resolve([]),
    writeFile: () => Promise.resolve('v2'),
    t: makeTranslate(zh),
  } as unknown as EditorViewProps
  return render(<EditorView {...props} />)
}

describe('file type marks', () => {
  it('gives TypeScript, JSON, and unknown files distinct marks', () => {
    expect(iconFor('main.ts', false).glyph).toBe('TS')
    expect(iconFor('data.json', false).glyph).toBe('{}')
    expect(iconFor('notes.unknownext', false)).toEqual(FILE_ICON)
  })

  it('recognizes whole names that carry their own identity', () => {
    // package.json is JSON, but its npm red is what an operator scans for.
    expect(iconFor('package.json', false).color).not.toBe(iconFor('tsconfig.json', false).color)
    expect(iconFor('Dockerfile', false).glyph).toBe('▤')
  })

  it('matches names case-insensitively', () => {
    expect(iconFor('MAIN.TS', false).glyph).toBe('TS')
    expect(iconFor('README.md', false).glyph).toBe('M')
  })

  it('marks a directory by whether it is open', () => {
    // An unnamed folder takes the default pair; `src` now carries its own
    // color, so the default is asserted with a name the table does not claim.
    expect(iconFor('whatever', true, false)).toEqual(FOLDER_ICON)
    expect(iconFor('whatever', true, true)).toEqual(FOLDER_OPEN_ICON)
  })

  it('paints each row mark with its own color', async () => {
    const { container } = mount()
    await screen.findByText('main.ts')

    const marks = [...container.querySelectorAll('[aria-hidden]')] as HTMLElement[]
    const colors = new Set(marks.map(m => m.style.color).filter(c => c !== ''))

    // A single shared color would defeat the point of the marks.
    expect(colors.size).toBeGreaterThan(1)
  })

  it('paints the mark with the type color, not the theme text color', async () => {
    // The stylesheet must not declare `color` on the mark: a theme color there
    // silently overrode every per-type color while the glyphs still rendered.
    const sheet = readFileSync(
      resolve(process.cwd(), 'packages/client/ui-editor/src/client/FileTree.module.css'),
      'utf8',
    )
    const rule = sheet.slice(sheet.indexOf('.icon {'), sheet.indexOf('.name {'))
    expect(rule).not.toMatch(/^\s*color:/m)

    const { container } = mount()
    await screen.findByText('main.ts')
    const marks = [...container.querySelectorAll('[aria-hidden]')] as HTMLElement[]
    const typescript = marks.find(m => m.textContent === 'TS')

    expect(typescript?.style.color).not.toBe('')
  })

  it('gives a two-letter mark room to render', () => {
    // A 10px box clipped `TS` and `GO`; the column is sized for two glyphs.
    const sheet = readFileSync(
      resolve(process.cwd(), 'packages/client/ui-editor/src/client/FileTree.module.css'),
      'utf8',
    )
    const rule = sheet.slice(sheet.indexOf('.icon {'), sheet.indexOf('.name {'))
    const width = /width:\s*(\d+)px/.exec(rule)

    expect(Number(width?.[1] ?? 0)).toBeGreaterThanOrEqual(16)
  })

  it('hides the marks from assistive technology, since the name carries the meaning', async () => {
    const { container } = mount()
    await screen.findByText('main.ts')

    const mark = container.querySelector('[aria-hidden]')

    expect(mark).not.toBeNull()
  })
})

describe('language detection', () => {
  it('names a language for every family the editor is meant to open', () => {
    // A file whose language resolves to plaintext renders with no colors at
    // all, which is what an operator reads as "the editor is broken".
    for (const [file, language] of [
      ['a.cs', 'csharp'], ['b.go', 'go'], ['c.rs', 'rust'],
      ['d.ts', 'typescript'], ['e.tsx', 'typescript'], ['f.jsx', 'javascript'],
      ['g.razor', 'razor'], ['h.cpp', 'cpp'], ['i.c', 'c'],
      ['j.py', 'python'], ['k.kt', 'kotlin'], ['l.sql', 'sql'],
      ['m.yaml', 'yaml'], ['n.scss', 'scss'], ['o.tf', 'hcl'],
    ] as const) {
      expect(languageOf(file)).toBe(language)
    }
  })

  it('names a language for files that carry no extension', () => {
    expect(languageOf('Dockerfile')).toBe('dockerfile')
    expect(languageOf('/srv/app/Dockerfile')).toBe('dockerfile')
  })

  it('names JSON for the file types that are JSON without saying so', () => {
    // A source map opened next to its bundle is read as often as the bundle,
    // and `.map` carries no hint that its content is JSON.
    expect(languageOf('client.js.map')).toBe('json')
    expect(languageOf('index.d.ts.map')).toBe('json')
    expect(languageOf('.babelrc')).toBe('json')
    expect(languageOf('app.webmanifest')).toBe('json')
  })

  it('falls back to plaintext only for genuinely unknown types', () => {
    expect(languageOf('notes.unknownext')).toBe('plaintext')
  })

  it('gives plain-text kinds their own mark instead of the bare fallback', () => {
    // `.txt` resolves to the plaintext language either way; what was missing
    // was a row mark, which left the file looking unhandled in the tree.
    expect(iconFor('notes.txt', false)).not.toEqual(FILE_ICON)
    expect(iconFor('app.log', false)).not.toEqual(FILE_ICON)
    expect(iconFor('data.csv', false)).not.toEqual(FILE_ICON)
  })

  it('gives a folder its own color when its name identifies its role', () => {
    // Following the Material Icon Theme convention: a tree is scanned by
    // shape, and one amber for every folder defeats that.
    const colors = ['src', 'tests', 'node_modules', 'dist', 'docs']
      .map(name => iconFor(name, true).color)

    expect(new Set(colors).size).toBe(colors.length)
    expect(iconFor('src', true).color).not.toBe(FOLDER_ICON.color)
  })

  it('falls back to the plain folder mark for an unnamed directory', () => {
    expect(iconFor('anything-else', true)).toEqual(FOLDER_ICON)
  })

  it('keeps a named folder\'s color when it opens', () => {
    // The open/closed distinction is drawn by the SVG, so only the color has
    // to survive the transition.
    expect(iconFor('src', true, true).color).toBe(iconFor('src', true, false).color)
  })

  it('matches folder names case-insensitively', () => {
    expect(iconFor('SRC', true).color).toBe(iconFor('src', true).color)
  })

  it('draws a directory as an SVG pictogram rather than a text glyph', async () => {
    // No text glyph both reads as a folder and accepts a color: the ones that
    // read correctly are emoji the platform paints itself.
    expect(FOLDER_ICON.glyph).toBe('')
    expect(FOLDER_OPEN_ICON.glyph).toBe('')

    const { container } = mount()
    await screen.findByText('src')
    const folderRow = screen.getByText('src').closest('li')

    expect(folderRow?.querySelector('svg')).not.toBeNull()
    // The SVG inherits the row's color, which is what makes it per-folder.
    expect(container.querySelector('svg')?.getAttribute('fill')).toBe('none')
  })

  it('colors the folder mark from the row, so the SVG inherits it', async () => {
    mount()
    await screen.findByText('src')

    const mark = screen.getByText('src').closest('li')?.querySelector('[aria-hidden]') as HTMLElement | null

    expect(mark?.style.color).not.toBe('')
  })
})

describe('syntax theme', () => {
  it('normalizes the color forms CSS yields into what Monaco accepts', () => {
    expect(normalizeColor('#aabbcc', '#000000')).toBe('#aabbcc')
    expect(normalizeColor('#abc', '#000000')).toBe('#aabbcc')
    expect(normalizeColor('rgb(18, 52, 86)', '#000000')).toBe('#123456')
    // An unusable value must fall back rather than break theme registration.
    expect(normalizeColor('', '#123456')).toBe('#123456')
    expect(normalizeColor('rebeccapurple', '#123456')).toBe('#123456')
  })

  it('reads the harness palette instead of hardcoding a second one', () => {
    document.body.style.setProperty('--shiki-token-keyword', '#ff0000')
    const palette = resolvePalette(document.body)

    expect(palette.keyword).toBe('#ff0000')
    document.body.style.removeProperty('--shiki-token-keyword')
  })

  it('paints comments, keywords, and strings differently', () => {
    const rules = tokenRules(resolvePalette(document.body))
    const at = (token: string) => rules.find(r => r.token === token)?.foreground

    expect(new Set([at('comment'), at('keyword'), at('string')]).size).toBe(3)
    expect(rules.find(r => r.token === 'comment')?.fontStyle).toBe('italic')
  })

  it('inherits Monaco defaults so unnamed scopes stay painted', () => {
    const theme = buildTheme(resolvePalette(document.body), true)

    expect(theme.inherit).toBe(true)
    expect(theme.base).toBe('vs-dark')
  })

  it('follows the page onto the light palette', () => {
    expect(buildTheme(resolvePalette(document.body), false).base).toBe('vs')
  })

  it('registers the theme before creating the editor', async () => {
    mount()
    ;(await screen.findByText('main.ts')).click()

    await waitFor(() => { expect(defined).toBeDefined() })
    expect(defined?.name).toBe(EDITOR_THEME)
  })
})
