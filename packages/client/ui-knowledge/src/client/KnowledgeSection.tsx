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
  /** Absolute source file when the skill provider exposes one. */
  readonly path?: string
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
  /** Open one source file in the host operating system's configured editor. */
  editFile: (path: string, signal: AbortSignal) => Promise<void>
  /** Describe the harness-owned Treadmill installation. */
  describeTreadmill: (signal: AbortSignal) => Promise<TreadmillInstallation>
  /** Read one installation file, relative to its root. */
  readTreadmillFile: (path: string, signal: AbortSignal) => Promise<string>
  /** Replace one installation file; the host applies it to the next request. */
  writeTreadmillFile: (path: string, content: string, signal: AbortSignal) => Promise<void>
  /** Switch the whole Treadmill on or off through the `treadmill` user setting. */
  setTreadmillEnabled: (enabled: boolean, signal: AbortSignal) => Promise<void>
  /**
   * Save one skill or command into the current project's `.dsh/skills`, where
   * it outranks the harness copy for that project. Resolves to the project path.
   */
  saveTreadmillFileToProject: (path: string, content: string, signal: AbortSignal) => Promise<string>
}

/** The Treadmill installation as the pane shows it. */
export interface TreadmillInstallation {
  root: string
  enabled: boolean
  pipelineError?: string
  files: readonly { path: string; category: string; size: number }[]
}

/** Which pane is showing. */
type Pane = 'skills' | 'decisions' | 'docs' | 'treadmill'
/** One installation file open in the editor, with its save state. */
interface TreadmillDraft { path: string; body: string; saved: boolean; savedTo?: string; error?: string }
const TREADMILL_CATEGORIES = ['esteira', 'skills', 'commands', 'rules', 'agents', 'tools', 'integrations'] as const
type TreadmillCategory = typeof TREADMILL_CATEGORIES[number] | 'other'
function categoryOf(category: string): TreadmillCategory {
  return (TREADMILL_CATEGORIES as readonly string[]).includes(category) ? category as TreadmillCategory : 'other'
}
const TREADMILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/**
 * The file a new installation entry starts from, per category. Skills and
 * integrations are directories with an entry file; the others are one file.
 * @param category - installation category.
 * @param name - validated entry name.
 * @returns the relative path and the template content.
 */
export function treadmillTemplate(category: TreadmillCategory, name: string): { path: string; content: string } | undefined {
  switch (category) {
    case 'skills':
      return { path: `skills/${name}/SKILL.md`, content: `---\nname: ${name}\ndescription: Use when …\n---\n\n# ${name}\n\nDescribe the runbook here.\n` }
    case 'commands':
      return { path: `commands/${name}.md`, content: `---\nname: ${name}\ndescription: Use when …\n---\n\nDescribe what the command does when invoked as /${name}.\n` }
    case 'agents':
      return { path: `agents/${name}.md`, content: `---\nname: ${name}\ndescription: What this agent is for\nmodel: inherit\n---\n\nDescribe the agent's role, inputs, and outputs.\n` }
    case 'rules':
      return { path: `rules/${name}.md`, content: `# ${name}\n\nState the rule, why it exists, and how it is verified.\n` }
    case 'tools':
      return { path: `tools/${name}.sh`, content: `#!/usr/bin/env bash\n# ${name} — describe what this tool checks.\nset -euo pipefail\n` }
    case 'integrations':
      return { path: `integrations/${name}/README.md`, content: `# ${name}\n\nDescribe the integration and how the Treadmill uses it.\n` }
    default:
      return undefined
  }
}

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
type DocPane = Exclude<Pane, 'skills' | 'treadmill'>
const KNOWLEDGE_DIRS: Readonly<Record<DocPane, readonly string[]>> = {
  decisions: ['docs/adr', '.agents/notes/proposed', '.agents/notes/implemented'],
  docs: ['docs', '.agents'],
}

/** How far below a knowledge directory a document may sit. */
const SCAN_DEPTH: Readonly<Record<DocPane, number>> = {
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
export function KnowledgeSection({
  listSkills, listDir, readFile, editFile, describeTreadmill, readTreadmillFile, writeTreadmillFile,
  setTreadmillEnabled, saveTreadmillFileToProject, t,
}: KnowledgeSectionProps) {
  const [pane, setPane] = useState<Pane>('skills')
  const [treadmill, setTreadmill] = useState<Loaded<TreadmillInstallation>>({ kind: 'loading' })
  const [draft, setDraft] = useState<TreadmillDraft | undefined>(undefined)
  const [treadmillGeneration, setTreadmillGeneration] = useState(0)

  useEffect(() => {
    if (pane !== 'treadmill') return
    const controller = new AbortController()
    setTreadmill({ kind: 'loading' })
    describeTreadmill(controller.signal).then(
      (installation) => { if (!controller.signal.aborted) setTreadmill({ kind: 'ready', items: [installation] }) },
      (error: unknown) => { if (!controller.signal.aborted) setTreadmill({ kind: 'failed', reason: failureText(error) }) },
    )
    return () => { controller.abort() }
  }, [pane, describeTreadmill, treadmillGeneration])

  const openTreadmillFile = useCallback((path: string) => {
    readTreadmillFile(path, new AbortController().signal).then(
      (body) => { setDraft({ path, body, saved: false }) },
      (error: unknown) => { setDraft({ path, body: '', saved: false, error: failureText(error) }) },
    )
  }, [readTreadmillFile])

  const saveDraft = useCallback(() => {
    if (draft === undefined) return
    const current = draft
    writeTreadmillFile(current.path, current.body, new AbortController().signal).then(
      () => {
        setDraft({ ...current, saved: true })
        setTreadmillGeneration(value => value + 1)
      },
      (error: unknown) => { setDraft({ ...current, saved: false, error: failureText(error) }) },
    )
  }, [draft, writeTreadmillFile])

  const createTreadmillFile = useCallback((path: string, content: string) => {
    writeTreadmillFile(path, content, new AbortController().signal).then(
      () => {
        setTreadmillGeneration(value => value + 1)
        setDraft({ path, body: content, saved: true })
      },
      (error: unknown) => { setTreadmill({ kind: 'failed', reason: failureText(error) }) },
    )
  }, [writeTreadmillFile])

  const saveDraftToProject = useCallback(() => {
    if (draft === undefined) return
    const current = draft
    saveTreadmillFileToProject(current.path, current.body, new AbortController().signal).then(
      (path) => { setDraft({ ...current, saved: false, savedTo: path }) },
      (error: unknown) => { setDraft({ ...current, saved: false, error: failureText(error) }) },
    )
  }, [draft, saveTreadmillFileToProject])

  const toggleTreadmill = useCallback((enabled: boolean) => {
    setTreadmillEnabled(enabled, new AbortController().signal).then(
      () => { setTreadmillGeneration(value => value + 1) },
      (error: unknown) => { setTreadmill({ kind: 'failed', reason: failureText(error) }) },
    )
  }, [setTreadmillEnabled])
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
    if (pane === 'skills' || pane === 'treadmill') return
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

  const edit = useCallback((path: string) => {
    const controller = new AbortController()
    void editFile(path, controller.signal).catch((error: unknown) => {
      setOpen({ name: path, body: failureText(error) })
    })
  }, [editFile])

  if (draft !== undefined) {
    return (
      <div className={css.root}>
        <div className={css.tabs}>
          <button type="button" className={css.tab} onClick={() => { setDraft(undefined) }}>
            {t('back')}
          </button>
          <span className={css.docTitle}>{draft.path}</span>
        </div>
        <textarea
          className={css.editor}
          value={draft.body}
          spellCheck={false}
          onChange={(event) => {
            const { savedTo: _savedTo, ...rest } = draft
            setDraft({ ...rest, body: event.target.value, saved: false })
          }}
        />
        <div className={css.rowActions}>
          <button type="button" className={css.openButton} onClick={saveDraft}>{t('treadmill.save')}</button>
          {(draft.path.startsWith('skills/') || draft.path.startsWith('commands/')) && (
            <button type="button" className={css.openButton} onClick={saveDraftToProject}>{t('treadmill.saveToProject')}</button>
          )}
          <button type="button" className={css.openButton} onClick={() => { setDraft(undefined) }}>{t('treadmill.cancel')}</button>
          {draft.saved && <span className={css.note} role="status">{t('treadmill.saved')}</span>}
          {draft.savedTo !== undefined && <span className={css.note} role="status">{t('treadmill.savedToProject', { path: draft.savedTo })}</span>}
          {draft.error !== undefined && <span className={css.note} role="alert">{t('failed', { reason: draft.error })}</span>}
        </div>
      </div>
    )
  }

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
        {(['skills', 'decisions', 'docs', 'treadmill'] as const).map(key => (
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
                        {skill.path !== undefined && (
                          <button type="button" className={css.openButton} onClick={() => { if (skill.path !== undefined) edit(skill.path) }}>
                            {t('edit')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )
          )}
        </>
      )}

      {pane === 'treadmill' && (
        <>
          {treadmill.kind === 'loading' && <p className={css.note} role="status">{t('loading')}</p>}
          {treadmill.kind === 'failed' && <p className={css.note} role="status">{t('failed', { reason: treadmill.reason })}</p>}
          {treadmill.kind === 'ready' && treadmill.items[0] !== undefined && (
            <TreadmillPane
              installation={treadmill.items[0]}
              t={t}
              onToggle={toggleTreadmill}
              onOpen={openTreadmillFile}
              onCreate={createTreadmillFile}
            />
          )}
        </>
      )}

      {pane !== 'skills' && pane !== 'treadmill' && (
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
                        <span className={css.name} title={doc.name}>{doc.name}</span>
                        <span className={css.rowActions}>
                          <button type="button" className={css.openButton} onClick={() => { show(doc) }}>
                            {t('open')}
                          </button>
                          <button type="button" className={css.openButton} onClick={() => { edit(doc.path) }}>
                            {t('edit')}
                          </button>
                        </span>
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

interface TreadmillPaneProps {
  installation: TreadmillInstallation
  t: KnowledgeSectionProps['t']
  onToggle: (enabled: boolean) => void
  onOpen: (path: string) => void
  onCreate: (path: string, content: string) => void
}

function TreadmillPane({ installation, t, onToggle, onOpen, onCreate }: TreadmillPaneProps) {
  const [creating, setCreating] = useState<TreadmillCategory | undefined>(undefined)
  const [newName, setNewName] = useState('')
  const [nameError, setNameError] = useState(false)
  const groups = new Map<TreadmillCategory, TreadmillInstallation['files']>()
  for (const file of installation.files) {
    const category = categoryOf(file.category)
    groups.set(category, [...groups.get(category) ?? [], file])
  }
  const submitNew = (category: TreadmillCategory) => {
    const template = TREADMILL_NAME.test(newName) ? treadmillTemplate(category, newName) : undefined
    if (template === undefined) {
      setNameError(true)
      return
    }
    setCreating(undefined)
    setNewName('')
    setNameError(false)
    onCreate(template.path, template.content)
  }
  return (
    <>
      <p className={css.note}>{t('treadmill.explain', { root: installation.root })}</p>
      <label className={css.toggle}>
        <input type="checkbox" checked={installation.enabled} onChange={(event) => { onToggle(event.target.checked) }} />
        {installation.enabled ? t('treadmill.enabled') : t('treadmill.disabled')}
      </label>
      {installation.pipelineError !== undefined && (
        <p className={css.note} role="alert">{t('treadmill.pipelineError', { reason: installation.pipelineError })}</p>
      )}
      {[...TREADMILL_CATEGORIES, 'other' as const].map((category) => {
        const files = groups.get(category) ?? []
        const creatable = treadmillTemplate(category, 'x') !== undefined
        if (files.length === 0 && !creatable) return null
        return (
          <section key={category} className={css.group}>
            <div className={css.groupHead}>
              <h4 className={css.groupTitle}>{t(`treadmill.category.${category}` as const)}</h4>
              {creatable && (
                <button
                  type="button"
                  className={css.openButton}
                  onClick={() => { setCreating(creating === category ? undefined : category); setNewName(''); setNameError(false) }}
                >
                  {creating === category ? t('treadmill.cancel') : t('treadmill.new')}
                </button>
              )}
            </div>
            {creating === category && (
              <form className={css.newForm} onSubmit={(event) => { event.preventDefault(); submitNew(category) }}>
                <input
                  className={css.filter}
                  value={newName}
                  placeholder={t('treadmill.newName')}
                  aria-label={t('treadmill.newName')}
                  onChange={(event) => { setNewName(event.target.value); setNameError(false) }}
                />
                <button type="submit" className={css.openButton}>{t('treadmill.create')}</button>
                {nameError && <span className={css.note} role="alert">{t('treadmill.invalidName')}</span>}
              </form>
            )}
            <ul className={css.list}>
              {files.map(file => (
                <li key={file.path} className={css.row}>
                  <span className={css.filePath}>{file.path}</span>
                  <span className={css.detail}>{file.size.toLocaleString()} B</span>
                  <button type="button" className={css.openButton} onClick={() => { onOpen(file.path) }}>{t('edit')}</button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}
