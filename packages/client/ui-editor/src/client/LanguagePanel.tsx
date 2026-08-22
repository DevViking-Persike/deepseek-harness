/**
 * The language-support panel: which language servers this deployment mounts,
 * which are missing, and how to install one.
 *
 * The list is not a plugin marketplace. A language server is an ordinary
 * program on the machine, so the panel reports what the composition mounts and
 * names the install command for what it does not — it never installs anything
 * itself, because writing to the machine is the operator's decision.
 */

import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { EditorLanguageServer } from '@deepseek-ai/dsh-api-remotes/client'
import type { EditorViewProps } from './EditorView.tsx'
import css from './LanguagePanel.module.css'

/** One language this editor knows how to support, mounted or not. */
export interface KnownLanguage {
  /** Provider id the composition would use (`typescript`, `python`). */
  readonly id: string
  /** Display name. */
  readonly label: string
  /** The server executable that serves it. */
  readonly command: string
  /** How to install that executable on this platform. */
  readonly install: string
  /** Frameworks this server covers, so the panel answers "what about Next?". */
  readonly frameworks?: readonly string[]
  /** A condition the server needs beyond being installed, when it has one. */
  readonly requires?: string
}

/**
 * The languages the editor is prepared to support.
 *
 * Frameworks are listed against the server that actually serves them: Next,
 * SvelteKit, and Tauri have no server of their own — their TypeScript is
 * served by the TypeScript server — and saying so prevents hunting for a
 * plugin that does not exist.
 */
export const KNOWN_LANGUAGES: readonly KnownLanguage[] = [
  {
    id: 'typescript',
    label: 'TypeScript / JavaScript',
    command: 'typescript-language-server',
    install: 'brew install typescript-language-server',
    frameworks: ['React', 'Next.js', 'Angular', 'Vue', 'SvelteKit', 'Tauri', 'Node.js'],
  },
  { id: 'python', label: 'Python', command: 'pyright-langserver', install: 'brew install pyright', frameworks: ['Django', 'FastAPI', 'Flask'] },
  { id: 'rust', label: 'Rust', command: 'rust-analyzer', install: 'rustup component add rust-analyzer', frameworks: ['Tauri', 'Axum'] },
  { id: 'go', label: 'Go', command: 'gopls', install: 'go install golang.org/x/tools/gopls@latest' },
  {
    id: 'csharp',
    label: 'C#',
    command: 'csharp-ls',
    install: 'dotnet tool install --global csharp-ls',
    frameworks: ['.NET', 'ASP.NET', 'Blazor', 'MAUI'],
    // Verified on this machine: csharp-ls exits when the workspace holds no
    // project file, so a loose .cs file gets no answers.
    requires: 'a .csproj or .sln in the workspace',
  },
  { id: 'clangd', label: 'C / C++', command: 'clangd', install: 'brew install llvm' },
  { id: 'svelte', label: 'Svelte', command: 'svelteserver', install: 'npm i -g svelte-language-server', frameworks: ['SvelteKit'] },
  { id: 'vue', label: 'Vue', command: 'vue-language-server', install: 'npm i -g @vue/language-server', frameworks: ['Nuxt'] },
]

/** Panel load state. */
type PanelState =
  | { kind: 'loading' }
  | { kind: 'ready'; mounted: readonly EditorLanguageServer[] }
  | { kind: 'failed'; reason: string }

/** Props: the wire call, the close callback, and the locale seat. */
export interface LanguagePanelProps {
  languageServers: EditorViewProps['languageServers']
  onClose: () => void
  t: EditorViewProps['t']
}

/**
 * Render the language-support panel.
 * @param props - the wire call, the close callback, and `t`.
 * @returns the dialog listing mounted and missing language servers.
 */
export function LanguagePanel({ languageServers, onClose, t }: LanguagePanelProps) {
  const [state, setState] = useState<PanelState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    languageServers(controller.signal).then(
      (mounted) => {
        if (controller.signal.aborted) return
        setState({ kind: 'ready', mounted })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) })
      },
    )
    return () => { controller.abort() }
  }, [languageServers])

  const mountedIds = new Set(state.kind === 'ready' ? state.mounted.map(s => s.id) : [])

  return (
    <div className={css.backdrop} role="dialog" aria-modal="true">
      <div className={css.panel}>
        <div className={css.header}>
          <h2 className={css.title}>{t('languages.title')}</h2>
          <button type="button" className={css.close} onClick={onClose}>{t('languages.close')}</button>
        </div>
        <p className={css.note}>{t('languages.explain')}</p>
        {state.kind === 'loading' && <p className={css.note} role="status">{t('languages.loading')}</p>}
        {state.kind === 'failed' && (
          <p className={css.note} role="status">{t('languages.failed', { reason: state.reason })}</p>
        )}
        {state.kind === 'ready' && (
          <ul className={css.list}>
            {KNOWN_LANGUAGES.map((language) => {
              const active = mountedIds.has(language.id)
              return (
                <li key={language.id} className={css.row}>
                  <span className={clsx(css.badge, active ? css.badgeOn : css.badgeOff)}>
                    {active ? t('languages.mounted') : t('languages.missing')}
                  </span>
                  <span className={css.label}>{language.label}</span>
                  {language.frameworks !== undefined && (
                    <span className={css.frameworks}>{language.frameworks.join(' · ')}</span>
                  )}
                  {active && language.requires !== undefined && (
                    <span className={css.requires}>{t('languages.requires', { requirement: language.requires })}</span>
                  )}
                  {!active && <code className={css.install}>{language.install}</code>}
                </li>
              )
            })}
          </ul>
        )}
        <p className={css.footnote}>{t('languages.capabilities')}</p>
      </div>
    </div>
  )
}
