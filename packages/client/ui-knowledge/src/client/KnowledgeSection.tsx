/**
 * The Knowledge settings section: what this session can draw on, and where
 * each piece comes from.
 *
 * Three panes over one question. Skills come from the skill registry, which
 * knows the root that supplied each one; decision records and documentation
 * are ordinary Markdown reached through the editor's own workspace-fenced
 * file calls, so this section adds no second way to read the disk.
 *
 * Origin is the load-bearing column. A skill committed to the project and one
 * living only in the operator's home behave identically at the prompt and
 * differently for everyone else, and the name alone hides that.
 */

import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { EditorDirEntry } from '@deepseek-ai/dsh-api-remotes/client'
import css from './KnowledgeSection.module.css'

/** One skill the session can invoke, with the root that supplied it. */
export interface KnowledgeSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse?: string
  readonly modelInvocable: boolean
  /** Registry source id (`project-agents`, `user-agents`, `custom`, …). */
  readonly source: string
}

/** One Markdown document under a knowledge directory. */
export interface KnowledgeDoc {
  readonly name: string
  readonly path: string
}

/** Wire calls injected from the plugin's apply closure. */
export interface KnowledgeInjected {
  /** The skills this session can invoke. */
  listSkills: (signal: AbortSignal) => Promise<readonly KnowledgeSkill[]>
  /** List one workspace directory; rejects when no filesystem is mounted. */
  listDir: (path: string | undefined, signal: AbortSignal) => Promise<{
    path: string
    root: string
    entries: readonly EditorDirEntry[]
  }>
  /** Read one workspace file as text. */
  readFile: (path: string, signal: AbortSignal) => Promise<{ content: string }>
}

/** Which pane is showing. */
type Pane = 'skills' | 'decisions' | 'docs'

/** Load state shared by every pane. */
type Loaded<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; items: readonly T[] }
  | { kind: 'failed'; reason: string }

/** Full props: the locale seat plus the injected wire calls. */
export type KnowledgeSectionProps = InjectFace<KnowledgeInjected> & PropsLocale<'knowledge'>

/** Failure text for a rejected call: an Error's own message, else its string form. */
function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Group a registry source id into the three origins an operator acts on.
 *
 * The registry distinguishes `-dsh` from `-agents` roots, which matters to the
 * loader and not to the reader: both are equally committed, or equally local.
 *
 * @param source - the registry source id.
 * @returns the origin key.
 */
export function originOf(source: string): 'project' | 'user' | 'composition' {
  if (source.startsWith('project-')) return 'project'
  if (source.startsWith('user-')) return 'user'
  return 'composition'
}

/**
 * Directories a decision record or document is read from, in display order.
 *
 * A decision record sits one level deeper than its root: notes are filed under
 * their kind (`implemented/architecture`, `proposed/feature`), so reading only
 * the top level finds the few files beside those directories and misses the
 * record set itself.
 */
const KNOWLEDGE_DIRS: Readonly<Record<Exclude<Pane, 'skills'>, readonly string[]>> = {
  decisions: ['docs/adr', '.agents/notes/proposed', '.agents/notes/implemented'],
  docs: ['docs', '.agents'],
}

/** How far below a knowledge directory a document may sit. */
const SCAN_DEPTH: Readonly<Record<Exclude<Pane, 'skills'>, number>> = {
  // One level covers the kind directories; anything deeper is archive.
  decisions: 1,
  docs: 0,
}

/** Files that describe a directory rather than record a decision. */
const NOT_A_RECORD = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md'])

/**
 * Render the Knowledge settings section.
 * @param props - the injected wire calls and `t`.
 * @returns the three-pane section.
 */
export function KnowledgeSection({ listSkills, listDir, readFile, t }: KnowledgeSectionProps) {
  const [pane, setPane] = useState<Pane>('skills')
  const [skills, setSkills] = useState<Loaded<KnowledgeSkill>>({ kind: 'loading' })
  const [docs, setDocs] = useState<Loaded<KnowledgeDoc>>({ kind: 'loading' })
  const [open, setOpen] = useState<{ name: string; body: string } | undefined>(undefined)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    listSkills(controller.signal).then(
      (items) => { if (!controller.signal.aborted) setSkills({ kind: 'ready', items }) },
      (error: unknown) => {
        if (!controller.signal.aborted) setSkills({ kind: 'failed', reason: failureText(error) })
      },
    )
    return () => { controller.abort() }
  }, [listSkills])

  // Markdown panes read the workspace directly; a directory that does not
  // exist in this project is skipped rather than reported, because a project
  // without `docs/adr` is ordinary, not broken.
  useEffect(() => {
    if (pane === 'skills') return
    const controller = new AbortController()
    setDocs({ kind: 'loading' })
    void (async () => {
      const found: KnowledgeDoc[] = []
      let reachedAny = false
      for (const dir of KNOWLEDGE_DIRS[pane]) {
        try {
          const listing = await listDir(dir, controller.signal)
          reachedAny = true
          const descend: string[] = []
          for (const entry of listing.entries) {
            if (entry.directory) {
              if (SCAN_DEPTH[pane] > 0) descend.push(`${dir}/${entry.name}`)
            } else if (entry.name.toLowerCase().endsWith('.md') && !NOT_A_RECORD.has(entry.name)) {
              found.push({ name: `${dir}/${entry.name}`, path: entry.path })
            }
          }
          for (const child of descend) {
            const level = await listDir(child, controller.signal)
            for (const entry of level.entries) {
              if (!entry.directory && entry.name.toLowerCase().endsWith('.md') && !NOT_A_RECORD.has(entry.name)) {
                found.push({ name: `${child}/${entry.name}`, path: entry.path })
              }
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return
          // An absent directory is not a failure; only a seam that answers
          // nothing at all is.
          if (found.length === 0 && !reachedAny && KNOWLEDGE_DIRS[pane].at(-1) === dir) {
            setDocs({ kind: 'failed', reason: failureText(error) })
            return
          }
        }
      }
      if (!controller.signal.aborted) setDocs({ kind: 'ready', items: found })
    })()
    return () => { controller.abort() }
  }, [pane, listDir])

  const show = useCallback((doc: KnowledgeDoc) => {
    const controller = new AbortController()
    readFile(doc.path, controller.signal).then(
      (file) => { setOpen({ name: doc.name, body: file.content }) },
      (error: unknown) => { setOpen({ name: doc.name, body: failureText(error) }) },
    )
  }, [readFile])

  if (open !== undefined) {
    return (
      <div className={css.root}>
        <div className={css.tabs}>
          <button type="button" className={css.tab} onClick={() => { setOpen(undefined) }}>
            {t('back')}
          </button>
          <span className={css.docTitle}>{open.name}</span>
        </div>
        <pre className={css.body}>{open.body}</pre>
      </div>
    )
  }

  return (
    <div className={css.root}>
      <div className={css.tabs}>
        {(['skills', 'decisions', 'docs'] as const).map(key => (
          <button
            key={key}
            type="button"
            className={clsx(css.tab, pane === key && css.tabActive)}
            onClick={() => { setPane(key) }}
          >
            {t(`tab.${key}` as const)}
          </button>
        ))}
      </div>

      {pane === 'skills' && (
        <>
          <p className={css.note}>{t('origin.explain')}</p>
          {skills.kind === 'loading' && <p className={css.note} role="status">{t('loading')}</p>}
          {skills.kind === 'failed' && (
            <p className={css.note} role="status">{t('failed', { reason: skills.reason })}</p>
          )}
          {skills.kind === 'ready' && (
            skills.items.length === 0
              ? <p className={css.note}>{t('empty')}</p>
              : (
                <>
                  <p className={css.note}>{t('skills.count', { count: String(skills.items.length) })}</p>
                  <ul className={css.list}>
                    {skills.items.map(skill => (
                      <li key={skill.name} className={css.row}>
                        <span className={clsx(css.origin, css[originOf(skill.source)])}>
                          {t(`origin.${originOf(skill.source)}` as const)}
                        </span>
                        <span className={css.name}>{skill.name}</span>
                        <span className={css.detail}>{skill.description}</span>
                        <span className={css.flag}>
                          {skill.modelInvocable ? t('skills.modelInvocable') : t('skills.userOnly')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )
          )}
        </>
      )}

      {pane !== 'skills' && (
        <>
          <input
            className={css.filter}
            value={filter}
            placeholder={t('filter')}
            onChange={(event) => { setFilter(event.target.value) }}
          />
          {docs.kind === 'loading' && <p className={css.note} role="status">{t('loading')}</p>}
          {docs.kind === 'failed' && (
            <p className={css.note} role="status">{t('failed', { reason: docs.reason })}</p>
          )}
          {docs.kind === 'ready' && (
            docs.items.length === 0
              ? <p className={css.note}>{t('empty')}</p>
              : (
                <ul className={css.list}>
                  {docs.items
                    .filter(doc => filter === '' || doc.name.toLowerCase().includes(filter.toLowerCase()))
                    .map(doc => (
                      <li key={doc.path} className={css.row}>
                        <span className={css.name}>{doc.name}</span>
                        <button type="button" className={css.openButton} onClick={() => { show(doc) }}>
                          {t('open')}
                        </button>
                      </li>
                    ))}
                </ul>
              )
          )}
        </>
      )}
    </div>
  )
}
