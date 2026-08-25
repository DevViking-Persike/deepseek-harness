/**
 * Code editor view: a workspace file tree beside a Monaco buffer.
 *
 * A save carries the version the file was read at, so a write that would
 * overwrite a concurrent agent edit is refused by the host and surfaced here as
 * a reload-or-lose choice rather than silently winning.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import clsx from 'clsx'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
// The panel slot this tab declares, plus the owner share it passes there.
import type {} from './contract.ts'
import type { EditorDirEntry } from '@deepseek-ai/dsh-api-remotes/client'
import { FileTree } from './FileTree.tsx'
import { languageOf, loadMonaco } from './monaco.ts'
import { buildTheme, EDITOR_THEME, isDarkTheme, resolvePalette } from './theme.ts'
import { registerIndentation } from './indentation.ts'
import { LanguagePanel } from './LanguagePanel.tsx'
import type { MonacoEditor } from './monaco.ts'
import css from './EditorView.module.css'

/** One file's text plus the freshness token its next save must present. */
export interface EditorFileBuffer {
  path: string
  content: string
  version: string
}

/** One directory level of the workspace tree. */
export interface EditorListing {
  path: string
  root: string
  entries: readonly EditorDirEntry[]
}

/** One panel registered in this tab's panel ring, as the switcher shows it. */
export interface EditorPanelTab {
  id: string
  label: string
}

/** Wire calls injected from the plugin's apply closure. */
export interface EditorViewInjected {
  /**
   * The panel ring's live entries. Read through the slot registry, so a panel
   * mounting or unmounting after this tab rendered changes the switcher too.
   */
  panels: {
    list: () => readonly EditorPanelTab[]
    subscribe: (fn: () => void) => () => void
    version: () => number
  }
  /** Report which language servers this composition mounts (introspection only). */
  languageServers: (signal: AbortSignal) => Promise<readonly { id: string; extensions: readonly string[] }[]>
  /** List one directory level; an absent path lists the workspace root. */
  listDir: (path: string | undefined, signal: AbortSignal) => Promise<EditorListing>
  /** Read one file as text along with its freshness token. */
  readFile: (path: string, signal: AbortSignal) => Promise<EditorFileBuffer>
  /**
   * Write one file, guarded by the token it was read at. Rejects with
   * {@link EditorStale} when the file moved on since then.
   */
  writeFile: (path: string, content: string, version: string) => Promise<string>
}

/** Marker for a save the host refused because the file changed since it was read. */
export class EditorStale extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditorStale'
  }
}

/** Marker for a filesystem the composition does not mount. */
export class EditorUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditorUnavailable'
  }
}

/** Marker for a write the sandbox refused. */
export class EditorDenied extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditorDenied'
  }
}

/**
 * The switcher id of the tab's own file tree. Not a ring entry: the tree is
 * what the editor shows when no other panel is chosen, so an empty ring leaves
 * a working editor rather than a blank pane.
 */
const FILES_PANEL = 'files'

/** Buffer load state for the currently open file. */
type BufferState =
  | { kind: 'none' }
  | { kind: 'loading'; path: string }
  | { kind: 'ready'; file: EditorFileBuffer }
  | { kind: 'failed'; reason: string }

/** Save state, reset whenever the buffer changes. */
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'stale' }
  | { kind: 'failed'; reason: string }

/**
 * Full props: the conversation-view kit, the injected wire calls, the panel
 * ring this tab declares, and the locale seat.
 */
export type EditorViewProps =
  ConvViewProps
  & PropsRenderSlots<'conversation.view.editor.panel'>
  & InjectFace<EditorViewInjected>
  & PropsLocale<'editor'>

/** Failure text for a rejected call: an Error's own message, else its string form. */
function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Render the editor tab.
 * @param props - the conversation-view kit, the injected wire calls, and `t`.
 * @returns the file tree beside the buffer, with their honest states.
 */
export function EditorView({
  listDir, readFile, writeFile, languageServers, panels, renderSlot, t,
}: EditorViewProps) {
  const [buffer, setBuffer] = useState<BufferState>({ kind: 'none' })
  // Which side panel the switcher shows; 'files' is the tab's own tree, so an
  // empty panel ring still leaves a working editor.
  const [panel, setPanel] = useState(FILES_PANEL)
  // The ring is a registry outside React, and its version is the fact that
  // moves — the same subscription the conversation view ring makes for its
  // own tabs.
  useSyncExternalStore(panels.subscribe, panels.version)
  const panelTabs = panels.list()
  const [save, setSave] = useState<SaveState>({ kind: 'idle' })
  const [dirty, setDirty] = useState(false)
  // Bumped to reopen the current file from disk after a stale save.
  const [reload, setReload] = useState(0)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const host = useRef<HTMLDivElement | null>(null)
  const tree = useRef<HTMLDivElement | null>(null)
  const editor = useRef<MonacoEditor | undefined>(undefined)
  // Registered once per mounted tab; the disposer runs with the tab.
  const indentation = useRef<(() => void) | undefined>(undefined)
  // The save handler changes on every keystroke; the Ctrl+S command Monaco
  // holds must call the current one, so it reads through a ref.
  const saveNow = useRef<() => void>(() => {})

  // The conversation column is itself a scroll container, and a wheel gesture
  // over the tree reaches it first, which scrolled the page instead of the file
  // list. Claiming the gesture while this box can still move keeps the wheel on
  // the tree; at its own edge the event is left alone so the page still scrolls.
  useEffect(() => {
    const el = tree.current
    if (el === null) return
    const onWheel = (event: WheelEvent): void => {
      if (event.deltaY === 0) return
      const atTop = el.scrollTop <= 0
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atEnd)) return
      event.preventDefault()
      el.scrollTop += event.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel) }
  }, [])

  // Monaco scrolls its own viewport, but the conversation column would consume
  // the gesture first and scroll the page under it. Stopping propagation while
  // a file is open leaves the wheel to the editor, which is the only thing the
  // pointer is over.
  useEffect(() => {
    const el = host.current
    if (el === null) return
    const onWheel = (event: WheelEvent): void => { event.stopPropagation() }
    el.addEventListener('wheel', onWheel)
    return () => { el.removeEventListener('wheel', onWheel) }
  }, [buffer.kind])

  const open = useCallback((path: string) => {
    setBuffer({ kind: 'loading', path })
    setSave({ kind: 'idle' })
    setDirty(false)
  }, [])

  // Load the selected file, and reload it when a stale save asks for it.
  useEffect(() => {
    if (buffer.kind !== 'loading') return
    const controller = new AbortController()
    const path = buffer.path
    readFile(path, controller.signal).then(
      (file) => {
        if (controller.signal.aborted) return
        setBuffer({ kind: 'ready', file })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setBuffer({ kind: 'failed', reason: failureText(error) })
      },
    )
    return () => { controller.abort() }
  }, [buffer, readFile, reload])

  // Create the editor once the buffer is ready and the host element exists.
  useEffect(() => {
    if (buffer.kind !== 'ready') return
    let disposed = false
    let subscription: { dispose: () => void } | undefined
    loadMonaco().then(
      (monaco) => {
        if (disposed || host.current === null) return
        // The harness owns one syntax palette; the editor reads it from the
        // live document so code here matches code in a chat message.
        monaco.editor.defineTheme(EDITOR_THEME, buildTheme(resolvePalette(host.current), isDarkTheme()))
        // Monaco ships tokenizers without indentation rules for every language
        // this editor opens, so Enter would fall back to bracket matching.
        indentation.current ??= registerIndentation(monaco.languages)
        const instance = editor.current ?? monaco.editor.create(host.current, {
          value: buffer.file.content,
          language: languageOf(buffer.file.path),
          automaticLayout: true,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          // Monaco draws its own scrollbars rather than using the browser's.
          // They stay functional but take no permanent width, matching the
          // file tree beside them; the minimap already shows position.
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 0,
            horizontalScrollbarSize: 0,
            useShadows: false,
          },
          overviewRulerBorder: false,
          fontSize: 12,
          theme: EDITOR_THEME,
        })
        editor.current = instance
        if (instance.getValue() !== buffer.file.content) instance.setValue(buffer.file.content)
        const model = instance.getModel()
        if (model !== null) monaco.editor.setModelLanguage(model, languageOf(buffer.file.path))
        subscription = instance.onDidChangeModelContent(() => {
          setDirty(true)
          setSave({ kind: 'idle' })
        })
        // KeyMod.CtrlCmd | KeyCode.KeyS, spelled numerically so this module
        // needs no value import from Monaco's own enums.
        instance.addCommand(2048 | 49, () => { saveNow.current() })
      },
      (error: unknown) => {
        if (disposed) return
        setBuffer({ kind: 'failed', reason: failureText(error) })
      },
    )
    return () => {
      disposed = true
      subscription?.dispose()
    }
  }, [buffer])

  // Dispose the editor when the tab unmounts, not on every buffer change.
  useEffect(() => () => {
    editor.current?.dispose()
    editor.current = undefined
    indentation.current?.()
    indentation.current = undefined
  }, [])

  const commit = useCallback(() => {
    if (buffer.kind !== 'ready') return
    const text = editor.current?.getValue() ?? buffer.file.content
    setSave({ kind: 'saving' })
    writeFile(buffer.file.path, text, buffer.file.version).then(
      (version) => {
        setBuffer({ kind: 'ready', file: { ...buffer.file, content: text, version } })
        setDirty(false)
        setSave({ kind: 'saved' })
      },
      (error: unknown) => {
        setSave(error instanceof EditorStale
          ? { kind: 'stale' }
          : { kind: 'failed', reason: error instanceof EditorDenied ? t('save.denied') : failureText(error) })
      },
    )
  }, [buffer, writeFile, t])
  saveNow.current = commit

  return (
    <div className={css.root}>
      <div className={css.side}>
        {panelTabs.length > 0 && (
          <div className={css.switcher} role="tablist">
            {[{ id: FILES_PANEL, label: t('panel.files') }, ...panelTabs].map(entry => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={panel === entry.id}
                className={clsx(css.switch, panel === entry.id && css.switchActive)}
                onClick={() => { setPanel(entry.id) }}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}
        <div className={clsx(css.tree, panel !== FILES_PANEL && css.panelHidden)} ref={tree}>
          <FileTree listDir={listDir} onOpen={open} openPath={buffer.kind === 'ready' ? buffer.file.path : undefined} t={t} />
        </div>
        {panel !== FILES_PANEL && (
          <div className={css.panel}>
            {renderSlot('conversation.view.editor.panel', {
              ...buffer.kind === 'ready' ? { openPath: buffer.file.path } : {},
              openFile: open,
              // A panel that rewrote the open file (a discard does) asks for
              // the buffer back from disk, so the editor never shows content
              // the working tree has already left.
              reloadBuffer: () => {
                if (buffer.kind !== 'ready') return
                setBuffer({ kind: 'loading', path: buffer.file.path })
                setSave({ kind: 'idle' })
                setDirty(false)
                setReload(value => value + 1)
              },
            }, { only: panel })}
          </div>
        )}
      </div>
      <div className={css.pane}>
        <div className={css.toolbar}>
          <span className={css.path}>
            {buffer.kind === 'ready' ? buffer.file.path : ''}
          </span>
          {dirty && <span className={css.dirty}>{t('save.dirty')}</span>}
          {save.kind === 'saving' && <span className={css.note}>{t('save.saving')}</span>}
          {save.kind === 'saved' && <span className={css.note}>{t('save.saved')}</span>}
          <button
            type="button"
            className={css.save}
            onClick={() => { setLanguagesOpen(true) }}
          >
            {t('languages.open')}
          </button>
          <button
            type="button"
            className={css.save}
            disabled={buffer.kind !== 'ready' || save.kind === 'saving'}
            onClick={commit}
          >
            {t('save')}
          </button>
        </div>
        {save.kind === 'stale' && (
          <div className={css.conflict} role="status">
            <span>{t('save.stale')}</span>
            <button
              type="button"
              className={css.save}
              onClick={() => {
                if (buffer.kind !== 'ready') return
                setBuffer({ kind: 'loading', path: buffer.file.path })
                setSave({ kind: 'idle' })
                setDirty(false)
                setReload(value => value + 1)
              }}
            >
              {t('save.reload')}
            </button>
          </div>
        )}
        {save.kind === 'failed' && <p className={css.note} role="status">{t('save.failed', { reason: save.reason })}</p>}
        {buffer.kind === 'none' && <p className={css.placeholder}>{t('buffer.none')}</p>}
        {buffer.kind === 'loading' && <p className={css.placeholder} role="status">{t('buffer.loading')}</p>}
        {buffer.kind === 'failed' && <p className={css.placeholder} role="status">{t('buffer.failed', { reason: buffer.reason })}</p>}
        <div className={clsx(css.editor, buffer.kind !== 'ready' && css.editorHidden)} ref={host} />
        {languagesOpen && (
          <LanguagePanel
            languageServers={languageServers}
            onClose={() => { setLanguagesOpen(false) }}
            t={t}
          />
        )}
      </div>
    </div>
  )
}
