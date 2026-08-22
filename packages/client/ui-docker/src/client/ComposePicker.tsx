/**
 * Compose picker dialog: browses the host filesystem for a compose YAML file
 * and asks the session's agent to run the project up or down against the
 * chosen host path. Selection happens host-side because a browser
 * `<input type="file">` yields a sandboxed handle, never the absolute path the
 * Docker CLI must be given. The lifecycle itself is the agent's logged tool
 * call, so the session log records every machine-state change.
 */

import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { DockerComposeBrowse } from '@deepseek-ai/dsh-api-remotes/client'
import type { DockerViewProps } from './DockerView.tsx'
import css from './ComposePicker.module.css'

/** Browse state for the level currently shown. */
type BrowseState =
  | { kind: 'loading' }
  | { kind: 'ready'; level: DockerComposeBrowse }
  | { kind: 'failed'; reason: string }

/**
 * State of the lifecycle REQUEST, not of the project. `sent` means the agent
 * accepted the instruction; the run itself proceeds as a logged tool call in
 * Chat, which is where its result appears.
 */
type RunState =
  | { kind: 'idle' }
  | { kind: 'sending'; action: 'up' | 'down' }
  | { kind: 'sent'; action: 'up' | 'down' }
  | { kind: 'failed'; reason: string }

/** Failure text for a rejected call: an Error's own message, else its string form. */
function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Props of the compose picker: the view's locale plus the injected calls. */
export interface ComposePickerProps {
  /** Browse one host directory level, filtered to directories and compose files. */
  browseCompose: DockerViewProps['browseCompose']
  /** Ask the session's agent to start the selected project. */
  composeUp: DockerViewProps['composeUp']
  /** Ask the session's agent to stop the selected project. */
  composeDown: DockerViewProps['composeDown']
  /** Close the dialog. */
  onClose: () => void
  /** Bound translate for the docker namespace. */
  t: DockerViewProps['t']
}

/**
 * Render the compose picker dialog.
 * @param props - injected calls, locale, and the close callback.
 * @returns the dialog element tree.
 */
export function ComposePicker({ browseCompose, composeUp, composeDown, onClose, t }: ComposePickerProps) {
  // `undefined` asks the host for its home directory, which is where a browse
  // with no prior selection starts.
  const [path, setPath] = useState<string | undefined>(undefined)
  const [browse, setBrowse] = useState<BrowseState>({ kind: 'loading' })
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [run, setRun] = useState<RunState>({ kind: 'idle' })

  useEffect(() => {
    const controller = new AbortController()
    setBrowse({ kind: 'loading' })
    browseCompose(path, controller.signal).then(
      (level) => {
        if (controller.signal.aborted) return
        setBrowse({ kind: 'ready', level })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setBrowse({ kind: 'failed', reason: failureText(error) })
      },
    )
    return () => { controller.abort() }
  }, [browseCompose, path])

  const lifecycle = useCallback((action: 'up' | 'down') => {
    if (selected === undefined) return
    setRun({ kind: 'sending', action })
    const call = action === 'up' ? composeUp : composeDown
    call(selected).then(
      () => { setRun({ kind: 'sent', action }) },
      (error: unknown) => { setRun({ kind: 'failed', reason: failureText(error) }) },
    )
  }, [selected, composeUp, composeDown])

  const busy = run.kind === 'sending'

  return (
    <div className={css.backdrop} role="dialog" aria-modal="true" aria-label={t('compose.title')}>
      <div className={css.panel}>
        <header className={css.header}>
          <h2 className={css.title}>{t('compose.title')}</h2>
          <button type="button" className={css.close} onClick={onClose}>{t('compose.close')}</button>
        </header>

        {browse.kind === 'ready' && (
          <nav className={css.crumbs} aria-label={t('compose.crumbs')}>
            {browse.level.crumbs.map(crumb => (
              <button
                key={crumb.path}
                type="button"
                className={css.crumb}
                disabled={busy}
                onClick={() => { setPath(crumb.path) }}
              >
                {crumb.name}
              </button>
            ))}
          </nav>
        )}

        {browse.kind === 'loading' && <p className={css.note} role="status">{t('compose.loading')}</p>}
        {browse.kind === 'failed' && <p className={css.note} role="status">{t('compose.browseFailed', { reason: browse.reason })}</p>}
        {browse.kind === 'ready' && (
          browse.level.entries.length === 0
            ? <p className={css.note}>{t('compose.empty')}</p>
            : (
              <ul className={css.entries}>
                {browse.level.entries.map(entry => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className={clsx(css.entry, entry.hidden && css.hidden, selected === entry.path && css.selected)}
                      disabled={busy}
                      onClick={() => {
                        if (entry.directory) setPath(entry.path)
                        else setSelected(entry.path)
                      }}
                    >
                      <span className={css.icon} aria-hidden>{entry.directory ? '📁' : '📄'}</span>
                      <span className={css.entryName}>{entry.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
        )}
        {browse.kind === 'ready' && browse.level.truncated && (
          <p className={css.note}>{t('compose.truncated')}</p>
        )}

        <footer className={css.footer}>
          <p className={css.selection}>
            {selected === undefined ? t('compose.none') : t('compose.selected', { file: selected })}
          </p>
          <div className={css.actions}>
            <button
              type="button"
              className={css.up}
              disabled={selected === undefined || busy}
              onClick={() => { lifecycle('up') }}
            >
              {t('compose.up')}
            </button>
            <button
              type="button"
              className={css.down}
              disabled={selected === undefined || busy}
              onClick={() => { lifecycle('down') }}
            >
              {t('compose.down')}
            </button>
          </div>
        </footer>

        {run.kind === 'sending' && (
          <p className={css.note} role="status">
            {run.action === 'up' ? t('compose.starting') : t('compose.stopping')}
          </p>
        )}
        {run.kind === 'failed' && <p className={css.note} role="status">{t('compose.runFailed', { reason: run.reason })}</p>}
        {run.kind === 'sent' && (
          <p className={css.note} role="status">
            {run.action === 'up' ? t('compose.sent.up') : t('compose.sent.down')}
          </p>
        )}
      </div>
    </div>
  )
}
