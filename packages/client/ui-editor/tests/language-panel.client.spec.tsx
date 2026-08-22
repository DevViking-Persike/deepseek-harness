// @vitest-environment jsdom
/**
 * The language-support panel reports what the deployment mounts, names the
 * install command for what it does not, and is honest about which editor
 * features a mounted server actually enables.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { KNOWN_LANGUAGES, LanguagePanel } from '../src/client/LanguagePanel.tsx'
import type { LanguagePanelProps } from '../src/client/LanguagePanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** Interpolate `{name}` placeholders the way the locale service does. */
function makeTranslate(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string>) => {
    const template = dict[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '')
  }
}

/** Render the panel over a scripted server listing. */
function mount(overrides: Partial<LanguagePanelProps> = {}) {
  const props = {
    languageServers: overrides.languageServers
      ?? (() => Promise.resolve([{ id: 'typescript', extensions: ['.ts'] }])),
    onClose: overrides.onClose ?? (() => {}),
    t: makeTranslate(zh),
  } as unknown as LanguagePanelProps
  return render(<LanguagePanel {...props} />)
}

describe('the language catalog', () => {
  it('names an install command for every language it lists', () => {
    // A row with no command tells the operator a server is missing without
    // telling them what to do about it.
    for (const language of KNOWN_LANGUAGES) {
      expect(language.install.length, language.id).toBeGreaterThan(0)
      expect(language.command.length, language.id).toBeGreaterThan(0)
    }
  })

  it('attributes each framework to the server that actually serves it', () => {
    // Next, SvelteKit, and Tauri have no server of their own; hunting for one
    // is the mistake this mapping prevents.
    const typescript = KNOWN_LANGUAGES.find(l => l.id === 'typescript')
    expect(typescript?.frameworks).toContain('Next.js')
    expect(typescript?.frameworks).toContain('SvelteKit')

    const csharp = KNOWN_LANGUAGES.find(l => l.id === 'csharp')
    expect(csharp?.frameworks).toContain('Blazor')
    expect(csharp?.frameworks).toContain('MAUI')
  })

  it('states a condition a server needs beyond being installed', async () => {
    // Verified against the real csharp-ls: it exits when the workspace holds
    // no project file, so an installed-but-silent server needs explaining.
    const csharp = KNOWN_LANGUAGES.find(l => l.id === 'csharp')
    expect(csharp?.requires).toMatch(/csproj|sln/)

    mount({ languageServers: () => Promise.resolve([{ id: 'csharp', extensions: ['.cs'] }]) })
    await screen.findByText('C#')

    expect(screen.getByText('C#').closest('li')?.textContent).toContain('csproj')
  })

  it('covers the languages the user asked for', () => {
    const ids = KNOWN_LANGUAGES.map(l => l.id)
    for (const id of ['typescript', 'python', 'rust', 'go', 'csharp', 'clangd', 'svelte', 'vue']) {
      expect(ids, id).toContain(id)
    }
  })
})

describe('the panel', () => {
  it('marks a mounted server as mounted and a missing one as not installed', async () => {
    mount({ languageServers: () => Promise.resolve([{ id: 'python', extensions: ['.py'] }]) })

    await screen.findByText('Python')
    const python = screen.getByText('Python').closest('li')
    const rust = screen.getByText('Rust').closest('li')

    expect(python?.textContent).toContain(zh['languages.mounted'])
    expect(rust?.textContent).toContain(zh['languages.missing'])
  })

  it('shows the install command only for what is missing', async () => {
    mount({ languageServers: () => Promise.resolve([{ id: 'go', extensions: ['.go'] }]) })

    await screen.findByText('Go')

    expect(screen.getByText('Go').closest('li')?.textContent).not.toContain('go install')
    expect(screen.getByText('Rust').closest('li')?.textContent).toContain('rustup')
  })

  it('states plainly which features a mounted server does and does not enable', async () => {
    mount()

    // Promising completion the seam cannot deliver would be the worse failure.
    expect(await screen.findByText(zh['languages.capabilities'])).toBeTruthy()
  })

  it('reports a failed read instead of showing an empty catalog', async () => {
    mount({ languageServers: () => Promise.reject(new Error('no seam')) })

    expect(await screen.findByText(zh['languages.failed'].replace('{reason}', 'no seam'))).toBeTruthy()
  })

  it('treats a composition with no language servers as all-missing, not an error', async () => {
    mount({ languageServers: () => Promise.resolve([]) })

    await screen.findByText('Rust')

    expect(screen.queryByText(zh['languages.mounted'])).toBeNull()
  })

  it('closes on request', async () => {
    const onClose = vi.fn()
    mount({ onClose })

    fireEvent.click(await screen.findByText(zh['languages.close']))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
