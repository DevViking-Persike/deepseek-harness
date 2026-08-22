/**
 * The workspace file tree: one lazily expanded directory level at a time.
 *
 * Levels load on demand rather than up front, because a project tree can hold
 * far more entries than an editor ever needs to show, and the host answers one
 * level per call.
 */

import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { EditorDirEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { EditorViewProps } from './EditorView.tsx'
import { iconFor } from './file-icons.ts'
import css from './FileTree.module.css'

/** One directory level, keyed by its absolute path. */
interface Level {
  entries: readonly EditorDirEntry[]
  expanded: ReadonlySet<string>
}

/** Tree load state. */
type TreeState =
  | { kind: 'loading' }
  | { kind: 'ready'; root: string; levels: ReadonlyMap<string, Level> }
  | { kind: 'failed'; reason: string }

/** Props: the listing call, the open-file callback, and the locale seat. */
export interface FileTreeProps {
  listDir: EditorViewProps['listDir']
  onOpen: (path: string) => void
  /** The file currently open in the buffer, highlighted in the tree. */
  openPath: string | undefined
  t: EditorViewProps['t']
}

/**
 * The folder mark, drawn rather than typed.
 *
 * A text glyph was the wrong tool here: the geometric shapes that exist in
 * every system font (parallelogram, square) do not read as a folder, and the
 * ones that do (`U+1F5C0`, and the folder emoji) are either missing from
 * common fonts or painted by the platform in its own colors — which defeats
 * the per-folder color entirely. An inline SVG inherits `currentColor`, so it
 * takes the color the row assigns and renders identically everywhere.
 *
 * @param props - whether the folder is expanded.
 * @returns the folder pictogram.
 */
function FolderGlyph({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      {open
        ? (
          <path
            d="M1.5 13V4.2c0-.4.3-.7.7-.7h3.4c.2 0 .4.1.5.2l1 1c.1.1.3.2.5.2h3.2c.4 0 .7.3.7.7v1.1M1.5 13l1.8-4.6c.1-.3.4-.5.7-.5h10.3c.5 0 .8.5.7.9L13.4 13H1.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        )
        : (
          <path
            d="M1.5 12.8V4.2c0-.4.3-.7.7-.7h3.4c.2 0 .4.1.5.2l1 1c.1.1.3.2.5.2h5.7c.4 0 .7.3.7.7v7.2c0 .4-.3.7-.7.7H2.2a.7.7 0 0 1-.7-.7Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        )}
    </svg>
  )
}

/** Failure text for a rejected call: an Error's own message, else its string form. */
function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Render the file tree.
 * @param props - the listing call, the open callback, and `t`.
 * @returns the expandable tree, or its loading, empty, and failure states.
 */
export function FileTree({ listDir, onOpen, openPath, t }: FileTreeProps) {
  const [state, setState] = useState<TreeState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    listDir(undefined, controller.signal).then(
      (listing) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'ready',
          root: listing.root,
          levels: new Map([[listing.path, { entries: listing.entries, expanded: new Set<string>() }]]),
        })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({ kind: 'failed', reason: failureText(error) })
      },
    )
    return () => { controller.abort() }
  }, [listDir])

  const toggle = useCallback((path: string) => {
    setState((current) => {
      if (current.kind !== 'ready') return current
      const levels = new Map(current.levels)
      const parent = [...levels.entries()].find(([, level]) => level.entries.some(e => e.path === path))
      if (parent === undefined) return current
      const [parentPath, level] = parent
      const expanded = new Set(level.expanded)
      if (expanded.has(path)) {
        expanded.delete(path)
        levels.set(parentPath, { ...level, expanded })
        return { ...current, levels }
      }
      expanded.add(path)
      levels.set(parentPath, { ...level, expanded })
      if (!levels.has(path)) {
        // The level is fetched below; an absent entry renders as loading.
        void listDir(path, new AbortController().signal).then((listing) => {
          setState((latest) => {
            if (latest.kind !== 'ready') return latest
            const next = new Map(latest.levels)
            next.set(listing.path, { entries: listing.entries, expanded: new Set<string>() })
            return { ...latest, levels: next }
          })
        }, () => {
          // A level that fails to load stays collapsed; the tree keeps working.
          setState((latest) => {
            if (latest.kind !== 'ready') return latest
            const next = new Map(latest.levels)
            const owner = next.get(parentPath)
            if (owner === undefined) return latest
            const rolledBack = new Set(owner.expanded)
            rolledBack.delete(path)
            next.set(parentPath, { ...owner, expanded: rolledBack })
            return { ...latest, levels: next }
          })
        })
      }
      return { ...current, levels }
    })
  }, [listDir])

  if (state.kind === 'loading') return <p className={css.note} role="status">{t('tree.loading')}</p>
  if (state.kind === 'failed') return <p className={css.note} role="status">{t('tree.failed', { reason: state.reason })}</p>

  const renderLevel = (path: string, depth: number): React.ReactNode => {
    const level = state.levels.get(path)
    if (level === undefined) return <p className={css.note}>{t('tree.loading')}</p>
    if (level.entries.length === 0) return <p className={css.note}>{t('tree.empty')}</p>
    return (
      <ul className={css.list}>
        {level.entries.map(entry => (
          <li key={entry.path}>
            <button
              type="button"
              className={clsx(css.row, entry.path === openPath && css.rowOpen)}
              style={{ paddingLeft: `${String(depth * 12 + 8)}px` }}
              onClick={() => {
                if (entry.directory) toggle(entry.path)
                else onOpen(entry.path)
              }}
            >
              <span
                className={css.icon}
                data-folder={entry.directory ? '1' : undefined}
                style={{ color: iconFor(entry.name, entry.directory, level.expanded.has(entry.path)).color }}
                aria-hidden
              >
                {entry.directory
                  ? <FolderGlyph open={level.expanded.has(entry.path)} />
                  : iconFor(entry.name, entry.directory, false).glyph}
              </span>
              <span className={css.name}>{entry.name}</span>
            </button>
            {entry.directory && level.expanded.has(entry.path) && renderLevel(entry.path, depth + 1)}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className={css.tree}>
      <p className={css.root} title={state.root}>{t('tree.root')}</p>
      {renderLevel(state.root, 0)}
    </div>
  )
}
