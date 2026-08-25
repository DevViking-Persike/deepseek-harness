// @vitest-environment jsdom
/**
 * Indentation: Monaco ships tokenizers without indentation rules for every
 * language this editor opens, so these rules are what make Enter place the
 * cursor at the right column. The patterns are asserted against real code
 * lines, not just checked for presence.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { EditorView } from '../src/client/EditorView.tsx'
import type { EditorViewProps } from '../src/client/EditorView.tsx'
import { resetMonacoForTests } from '../src/client/monaco.ts'
import { LANGUAGE_CONFIGS } from '../src/client/language-configs.ts'
import { registerIndentation, toMonacoConfig, toOnEnterRule, toRegExp } from '../src/client/indentation.ts'
import type { MonacoLanguages } from '../src/client/indentation.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

let registered: { id: string; config: Record<string, unknown> }[] = []
let disposed = 0

beforeEach(() => {
  resetMonacoForTests()
  registered = []
  disposed = 0
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
      getLanguages: () => [
        { id: 'typescript' }, { id: 'javascript' }, { id: 'go' },
        { id: 'rust' }, { id: 'c' }, { id: 'cpp' }, { id: 'csharp' },
      ],
      setLanguageConfiguration: (id: string, config: Record<string, unknown>) => {
        registered.push({ id, config })
        return { dispose: () => { disposed += 1 } }
      },
    },
  }
})

/** The compiled indentation patterns for one language. */
function rulesFor(language: string) {
  const config = toMonacoConfig(LANGUAGE_CONFIGS[language]!)
  return config.indentationRules as { increaseIndentPattern: RegExp; decreaseIndentPattern: RegExp }
}

describe('pattern conversion', () => {
  it('accepts both the string and the flagged object form', () => {
    // VS Code writes patterns both ways; a string left uncompiled would be
    // silently ignored, because Monaco calls .test() on the value.
    expect(toRegExp('^a')).toBeInstanceOf(RegExp)
    expect(toRegExp({ pattern: '^a', flags: 'i' })?.flags).toContain('i')
    expect(toRegExp(undefined)).toBeUndefined()
  })

  it('drops a pattern this engine cannot compile instead of failing the language', () => {
    expect(toRegExp('([')).toBeUndefined()
  })

  it('maps the named indent action onto the numeric one Monaco expects', () => {
    const rule = toOnEnterRule({ beforeText: '^x', action: { indent: 'indent' } })

    expect((rule?.action as { indentAction: number }).indentAction).toBe(1)
  })

  it('drops an Enter rule whose required pattern cannot compile', () => {
    expect(toOnEnterRule({ beforeText: '([', action: { indent: 'none' } })).toBeUndefined()
  })

  it('emits no bracket or auto-closing fields, so Monaco keeps its own', () => {
    // Monaco merges per field; naming brackets here would replace the ones the
    // language already registered.
    const config = toMonacoConfig(LANGUAGE_CONFIGS.go!)

    expect(Object.keys(config).sort()).toEqual(['indentationRules', 'onEnterRules'])
  })
})

describe('the rules against real code', () => {
  it('indents a Go switch case and outdents the next one', () => {
    const go = rulesFor('go')

    expect(go.increaseIndentPattern.test('\tcase 1:')).toBe(true)
    expect(go.increaseIndentPattern.test('func main() {')).toBe(true)
    expect(go.decreaseIndentPattern.test('\tcase 2:')).toBe(true)
    expect(go.decreaseIndentPattern.test('}')).toBe(true)
    expect(go.increaseIndentPattern.test('x := 1')).toBe(false)
  })

  it('indents a Rust block and outdents its closing brace', () => {
    const rust = rulesFor('rust')

    expect(rust.increaseIndentPattern.test('fn main() {')).toBe(true)
    expect(rust.decreaseIndentPattern.test('  }')).toBe(true)
    expect(rust.increaseIndentPattern.test('let x = 1;')).toBe(false)
  })

  it('indents a C# switch body, which upstream ships no rules for', () => {
    const csharp = rulesFor('csharp')

    expect(csharp.increaseIndentPattern.test('public void Run() {')).toBe(true)
    expect(csharp.increaseIndentPattern.test('    case 1:')).toBe(true)
    expect(csharp.decreaseIndentPattern.test('    }')).toBe(true)
    expect(csharp.decreaseIndentPattern.test('    default:')).toBe(true)
  })

  it('indents TypeScript blocks and C++ braces', () => {
    expect(rulesFor('typescript').increaseIndentPattern.test('function f() {')).toBe(true)
    expect(rulesFor('typescript').decreaseIndentPattern.test('}')).toBe(true)
    expect(rulesFor('cpp').increaseIndentPattern.test('int main() {')).toBe(true)
  })

  it('continues a line comment onto the next line', () => {
    const go = toMonacoConfig(LANGUAGE_CONFIGS.go!)
    const rules = go.onEnterRules as { beforeText: RegExp; action: { appendText?: string } }[]
    const comment = rules.find(r => r.action.appendText === '// ')

    expect(comment?.beforeText.test('// a note')).toBe(true)
  })

  it('carries rules for every language the editor targets', () => {
    for (const language of ['typescript', 'javascript', 'go', 'rust', 'c', 'cpp', 'csharp']) {
      const config = toMonacoConfig(LANGUAGE_CONFIGS[language]!)
      expect(config.indentationRules, language).toBeDefined()
    }
  })
})

describe('registration', () => {
  it('registers every language Monaco knows', () => {
    const dispose = registerIndentation((window as never as { monaco: { languages: never } }).monaco.languages)

    expect(registered.map(r => r.id).sort()).toEqual(
      ['c', 'cpp', 'csharp', 'go', 'javascript', 'rust', 'typescript'],
    )
    dispose()
  })

  it('skips a language Monaco has not registered, since that call throws', () => {
    const languages: MonacoLanguages = {
      getLanguages: () => [{ id: 'go' }],
      setLanguageConfiguration: (id: string, config: unknown) => {
        registered.push({ id, config: config as Record<string, unknown> })
        return { dispose: () => {} }
      },
    }

    registerIndentation(languages)

    expect(registered.map(r => r.id)).toEqual(['go'])
  })

  it('removes every registration through the returned disposer', () => {
    const dispose = registerIndentation((window as never as { monaco: { languages: never } }).monaco.languages)

    dispose()

    expect(disposed).toBe(registered.length)
  })
})

describe('the editor registers indentation on open', () => {
  it('registers once when the first file opens', async () => {
    const props = {
      listDir: () => Promise.resolve({
        path: '/w', root: '/w',
        entries: [{ name: 'main.go', path: '/w/main.go', directory: false }],
      }),
      readFile: () => Promise.resolve({ path: '/w/main.go', content: 'package main\n', version: 'v1' }),
      languageServers: () => Promise.resolve([]),
      panels: { list: () => [], subscribe: () => () => {}, version: () => 0 },
      renderSlot: () => null,
      writeFile: () => Promise.resolve('v2'),
      t: (key: string) => zh[key as keyof typeof zh] ?? key,
    } as unknown as EditorViewProps
    render(<EditorView {...props} />)

    ;(await screen.findByText('main.go')).click()

    await waitFor(() => { expect(registered.length).toBeGreaterThan(0) })
    expect(registered.some(r => r.id === 'go')).toBe(true)
  })
})
