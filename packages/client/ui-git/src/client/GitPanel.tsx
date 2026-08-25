/**
 * Version-control panel inside the editor tab: a repository picker over every
 * workspace, the changed-file list with per-file stage/unstage/discard, and a
 * commit box.
 *
 * Selecting a file opens it in the editor's own buffer, which is why this
 * lives inside that tab rather than beside it: reviewing a change and editing
 * it stay one gesture apart.
 */

import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
// Type-only: the 'conversation.view.editor.panel' SlotMap row, declared by the
// editor tab that owns it, must be in the program for PropsRuntime to resolve
// this panel's owner share.
import type {} from '@deepseek-ai/dsh-client-ui-editor/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { DiffBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiffHunk } from '@deepseek-ai/dsh-client-ui-primitives'
import { GitGraph } from './GitGraph.tsx'
import css from './GitPanel.module.css'

/** One repository the picker offers. */
export interface GitRepositoryRow {
  root: string
  name: string
  workspaceTitle: string
  submodule: boolean
}

/** One changed path, both sides of the index kept apart. */
export interface GitChangeRow {
  path: string
  absolutePath: string
  index: string
  worktree: string
  origPath?: string
  binary: boolean
  insertions?: number
  deletions?: number
}

/** One repository's working-tree state. */
export interface GitStatusView {
  root: string
  branch?: string
  upstream?: string
  ahead: number
  behind: number
  changes: readonly GitChangeRow[]
  truncated: boolean
}

/** One checkout of the selected repository. */
export interface GitWorktreeRow {
  path: string
  name: string
  branch?: string
  main: boolean
  detached: boolean
  bare: boolean
  locked?: string
  prunable?: string
  changes?: number
}

/** How this checkout stands against one integration branch. */
export interface GitBaseRow {
  base: string
  ahead: number
  behind: number
  conflicts?: boolean
}

/** One commit of the graph, with the parents that shape its lanes. */
export interface GitGraphCommitRow {
  id: string
  parents: readonly string[]
  refs: readonly string[]
  subject: string
  authorName: string
  authoredAt: string
}

/** Wire calls injected from the plugin's apply closure. */
export interface GitPanelInjected {
  /** List every repository inside the registered workspaces. */
  listRepositories: (signal: AbortSignal) => Promise<readonly GitRepositoryRow[]>
  /** List every checkout of one repository, with the changes each holds. */
  worktrees: (root: string, signal: AbortSignal) => Promise<readonly GitWorktreeRow[]>
  /** Compare this checkout against the deployment's integration branches. */
  compareBases: (root: string, signal: AbortSignal) => Promise<readonly GitBaseRow[]>
  /** Read the commit graph of this checkout. */
  graph: (root: string, signal: AbortSignal) => Promise<{
    commits: readonly GitGraphCommitRow[]
    truncated: boolean
  }>
  /** Read one repository's working-tree state. */
  status: (root: string, signal: AbortSignal) => Promise<GitStatusView>
  /** Stage paths, answering the settled status. */
  stage: (root: string, paths: readonly string[]) => Promise<GitStatusView>
  /** Read one file's content before and after its change, for the diff view. */
  diff: (root: string, path: string, staged: boolean, signal: AbortSignal) => Promise<{
    path: string
    oldText: string | null
    newText: string | null
    binary: boolean
  }>
  /** Unstage paths, answering the settled status. */
  unstage: (root: string, paths: readonly string[]) => Promise<GitStatusView>
  /** Discard one path; the recovery id is what makes the discard undoable. */
  discard: (root: string, path: string, staged: boolean) => Promise<{
    status: GitStatusView
    recoveredOid?: string
  }>
  /** Commit the staged changes, answering the new commit and settled status. */
  commit: (root: string, message: string) => Promise<{ subject: string; status: GitStatusView }>
  /** Ask the session's agent to perform the same commit, so the session log records it. */
  requestCommit: (root: string, message: string) => Promise<void>
}

/** Marker for a composition that mounts no Git seam. */
export class GitUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitUnavailable'
  }
}

/** Full props: the panel owner share, the injected wire calls, and the locale seat. */
export type GitPanelProps =
  PropsRuntime<'conversation.view.editor.panel'>
  & InjectFace<GitPanelInjected>
  & PropsLocale<'git'>

/** Repository list state. */
type ReposState =
  | { kind: 'loading' }
  | { kind: 'ready'; repositories: readonly GitRepositoryRow[] }
  | { kind: 'unavailable' }
  | { kind: 'failed'; reason: string }

/** Working-tree state of the selected repository. */
type StatusState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; status: GitStatusView }
  | { kind: 'failed'; reason: string }

/** What the last discard preserved, so the panel can offer it back. */
interface Recovery {
  path: string
  oid: string
}

/** The diff of the selected change, shown under its row. */
type DiffState =
  | { kind: 'none' }
  | { kind: 'loading'; path: string }
  | { kind: 'ready'; path: string; hunks: DiffHunk[] }
  | { kind: 'binary'; path: string }
  | { kind: 'failed'; path: string; reason: string }

/** Failure text for a rejected call: an Error's own message, else its string form. */
function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The changed paths a status state carries, or none while it is not ready. */
function changesOf(state: StatusState): readonly GitChangeRow[] {
  return state.kind === 'ready' ? state.status.changes : []
}

/** Whether a change has anything staged (its index side is not clean). */
function isStaged(change: GitChangeRow): boolean {
  return change.index !== 'unmodified' && change.index !== 'untracked'
}

/** Whether a change has an unstaged edit (its worktree side is not clean). */
function isUnstaged(change: GitChangeRow): boolean {
  return change.worktree !== 'unmodified'
}

/**
 * Render the version-control panel.
 * @param props - the panel owner share, the injected wire calls, and `t`.
 * @returns the repository picker, the change list, and the commit box.
 */
export function GitPanel({
  openPath, openFile, reloadBuffer,
  listRepositories, worktrees, compareBases, graph,
  status, diff, stage, unstage, discard, commit, requestCommit,
  t,
}: GitPanelProps) {
  // Which body the panel shows: the change list, or the commit graph.
  const [view, setView] = useState<'changes' | 'graph'>('changes')
  const [bases, setBases] = useState<readonly GitBaseRow[]>([])
  const [history, setHistory] = useState<{ commits: readonly GitGraphCommitRow[]; truncated: boolean }>(
    { commits: [], truncated: false },
  )
  const [repos, setRepos] = useState<ReposState>({ kind: 'loading' })
  const [selected, setSelected] = useState<string | undefined>(undefined)
  // Which checkout the change list below is showing. A repository normally has
  // one; `git worktree add` is what makes this a choice.
  const [checkout, setCheckout] = useState<string | undefined>(undefined)
  const [trees, setTrees] = useState<readonly GitWorktreeRow[]>([])
  const [tree, setTree] = useState<StatusState>({ kind: 'idle' })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [recovery, setRecovery] = useState<Recovery | undefined>(undefined)
  const [notice, setNotice] = useState<string | undefined>(undefined)
  // Which change's diff is expanded. Selecting a row shows the change inline;
  // opening it in the editor buffer stays a separate, explicit gesture.
  const [openDiff, setOpenDiff] = useState<string | undefined>(undefined)
  const [diffState, setDiffState] = useState<DiffState>({ kind: 'none' })

  useEffect(() => {
    const controller = new AbortController()
    listRepositories(controller.signal).then(
      (found) => {
        if (controller.signal.aborted) return
        setRepos({ kind: 'ready', repositories: found })
        // Selecting the first repository makes the panel useful on open; a
        // workspace normally holds exactly one.
        setSelected(current => current ?? found[0]?.root)
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setRepos(error instanceof GitUnavailable
          ? { kind: 'unavailable' }
          : { kind: 'failed', reason: failureText(error) })
      },
    )
    return () => { controller.abort() }
  }, [listRepositories])

  // Reload the repository's checkouts whenever the selection changes, and
  // point the change list at its main working tree.
  useEffect(() => {
    if (selected === undefined) return
    const controller = new AbortController()
    worktrees(selected, controller.signal).then(
      (found) => {
        if (controller.signal.aborted) return
        setTrees(found)
        // The main working tree is where an operator starts; a linked checkout
        // is an explicit choice.
        setCheckout(found.find(entry => entry.main)?.path ?? selected)
      },
      () => {
        if (controller.signal.aborted) return
        // A repository whose checkouts cannot be listed still has its own
        // working tree, which the change list below reads directly.
        setTrees([])
        setCheckout(selected)
      },
    )
    return () => { controller.abort() }
  }, [selected, worktrees])

  // Read the state of whichever checkout is showing — each has its own index
  // and its own working tree over one shared object database.
  useEffect(() => {
    if (checkout === undefined) return
    const controller = new AbortController()
    setTree({ kind: 'loading' })
    status(checkout, controller.signal).then(
      (value) => {
        if (controller.signal.aborted) return
        setTree({ kind: 'ready', status: value })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setTree({ kind: 'failed', reason: failureText(error) })
      },
    )
    return () => { controller.abort() }
  }, [checkout, status])

  // Load the expanded row's diff. Keyed on `tree` as well, so a stage or
  // discard that moved the file re-reads it rather than leaving the shown
  // content behind the working tree.
  useEffect(() => {
    if (checkout === undefined || openDiff === undefined) return
    const change = changesOf(tree).find(entry => entry.path === openDiff)
    if (change === undefined) return
    const controller = new AbortController()
    setDiffState({ kind: 'loading', path: openDiff })
    // A change with nothing unstaged is read against HEAD; otherwise the
    // working-tree side is what the person is looking at.
    const staged = isStaged(change) && !isUnstaged(change)
    diff(checkout, openDiff, staged, controller.signal).then(
      (value) => {
        if (controller.signal.aborted) return
        if (value.binary) {
          setDiffState({ kind: 'binary', path: openDiff })
          return
        }
        setDiffState({
          kind: 'ready',
          path: openDiff,
          // DiffBlock draws an absent old side as a new file, which is exactly
          // what an added or untracked path is.
          hunks: [{ path: openDiff, oldText: value.oldText, newText: value.newText ?? '' }],
        })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setDiffState({ kind: 'failed', path: openDiff, reason: failureText(error) })
      },
    )
    return () => { controller.abort() }
  }, [checkout, openDiff, diff, tree])

  // How this checkout stands against main/develop, re-read whenever the
  // checkout changes or a mutation settles: the answer is what decides whether
  // pushing is safe, so a stale one is worse than none.
  useEffect(() => {
    if (checkout === undefined) return
    const controller = new AbortController()
    compareBases(checkout, controller.signal).then(
      (found) => {
        if (controller.signal.aborted) return
        setBases(found)
      },
      () => {
        if (controller.signal.aborted) return
        // A repository without integration branches is the ordinary case for
        // a scratch repo; the banner simply does not appear.
        setBases([])
      },
    )
    return () => { controller.abort() }
  }, [checkout, compareBases, tree])

  // The graph is only read while it is on screen: it is the most expensive
  // call this panel makes, and the change list is what opens by default.
  useEffect(() => {
    if (checkout === undefined || view !== 'graph') return
    const controller = new AbortController()
    graph(checkout, controller.signal).then(
      (found) => {
        if (controller.signal.aborted) return
        setHistory(found)
      },
      () => {
        if (controller.signal.aborted) return
        setHistory({ commits: [], truncated: false })
      },
    )
    return () => { controller.abort() }
  }, [checkout, view, graph])

  /**
   * Run one mutation and fold its settled status back in. Every mutation
   * answers the status, so the panel never renders a state the repository has
   * already left.
   */
  const mutate = useCallback(async (run: () => Promise<GitStatusView>) => {
    setBusy(true)
    setNotice(undefined)
    try {
      setTree({ kind: 'ready', status: await run() })
    } catch (error: unknown) {
      setNotice(failureText(error))
    } finally {
      setBusy(false)
    }
  }, [])

  // Mutations address the CHECKOUT being shown, not the repository root: each
  // worktree owns its index and working tree, so staging in one must never
  // touch another.
  const repository = checkout
  const changes = tree.kind === 'ready' ? tree.status.changes : []
  const stagedCount = changes.filter(isStaged).length
  // Only bases that actually moved are worth a warning; one level with this
  // branch is the ordinary state and needs no banner.
  const behindBases = bases.filter(base => base.behind > 0)
  const conflicting = behindBases.some(base => base.conflicts === true)

  if (repos.kind === 'loading') return <p className={css.placeholder}>{t('repos.loading')}</p>
  if (repos.kind === 'unavailable') return <p className={css.placeholder}>{t('unavailable')}</p>
  if (repos.kind === 'failed') {
    return <p className={css.placeholder} role="status">{t('repos.failed', { reason: repos.reason })}</p>
  }
  if (repos.repositories.length === 0) return <p className={css.placeholder}>{t('repos.empty')}</p>

  return (
    <div className={css.root}>
      {/* One workspace normally holds one repository, but a monorepo with
          submodules holds several, and they are what this picker exists for. */}
      <select
        className={css.picker}
        aria-label={t('repos.label')}
        value={selected ?? ''}
        onChange={(event) => { setSelected(event.target.value) }}
      >
        {repos.repositories.map(repo => (
          <option key={repo.root} value={repo.root}>
            {repo.submodule ? `${repo.workspaceTitle} / ${repo.name} ↳` : `${repo.workspaceTitle} / ${repo.name}`}
          </option>
        ))}
      </select>

      {/* Only worth drawing when the repository actually has linked checkouts:
          most have one, and a list of one is chrome that tells nothing. */}
      {trees.length > 1 && (
        <div className={css.worktrees}>
          <div className={css.worktreesHead}>{t('worktrees.count', { count: String(trees.length) })}</div>
          {trees.map(entry => (
            <button
              key={entry.path}
              type="button"
              className={clsx(css.worktree, entry.path === checkout && css.worktreeActive)}
              title={entry.path}
              disabled={entry.bare || entry.prunable !== undefined}
              onClick={() => { setCheckout(entry.path) }}
            >
              <span className={css.worktreeName}>
                {entry.branch ?? (entry.bare ? t('worktrees.bare') : t('branch.detached'))}
              </span>
              <span className={css.worktreeMeta}>
                {entry.main && <span className={css.badge}>{t('worktrees.main')}</span>}
                {/* A locked checkout refuses removal and a prunable one has
                    already lost its directory: both change what may be done
                    here, so neither is left to be discovered by failure. */}
                {entry.locked !== undefined && (
                  <span className={css.badge} title={entry.locked}>{t('worktrees.locked')}</span>
                )}
                {entry.prunable !== undefined && (
                  <span className={css.badge} title={entry.prunable}>{t('worktrees.prunable')}</span>
                )}
                {entry.changes !== undefined && entry.changes > 0 && (
                  <span className={css.counts}>{t('worktrees.changes', { count: String(entry.changes) })}</span>
                )}
                {entry.changes === 0 && <span className={css.counts}>{t('worktrees.clean')}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {tree.kind === 'ready' && (
        <div className={css.branch}>
          <span className={css.branchName}>{tree.status.branch ?? t('branch.detached')}</span>
          {tree.status.upstream !== undefined && (tree.status.ahead > 0 || tree.status.behind > 0) && (
            <span className={css.divergence}>
              {t('branch.divergence', {
                ahead: String(tree.status.ahead),
                behind: String(tree.status.behind),
              })}
            </span>
          )}
        </div>
      )}

      {/* The push-safety banner: a base that moved is what turns a push into
          a forced merge or a rejected one, so it is stated before the change
          list rather than discovered at push time. */}
      {behindBases.length > 0 && (
        <div className={clsx(css.warning, conflicting && css.warningConflict)} role="status">
          {behindBases.map(base => (
            <div key={base.base}>
              {base.conflicts === true
                ? t('base.conflicts', { base: base.base, behind: String(base.behind) })
                : t('base.behind', { base: base.base, behind: String(base.behind) })}
            </div>
          ))}
        </div>
      )}

      <div className={css.views} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'changes'}
          className={clsx(css.viewTab, view === 'changes' && css.viewTabActive)}
          onClick={() => { setView('changes') }}
        >
          {t('view.changes')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'graph'}
          className={clsx(css.viewTab, view === 'graph' && css.viewTabActive)}
          onClick={() => { setView('graph') }}
        >
          {t('view.graph')}
        </button>
      </div>

      {view === 'graph' && (
        <GitGraph commits={history.commits} truncated={history.truncated} t={t} />
      )}

      {view === 'changes' && tree.kind === 'loading' && <p className={css.placeholder} role="status">{t('status.loading')}</p>}
      {view === 'changes' && tree.kind === 'failed' && (
        <p className={css.placeholder} role="status">{t('status.failed', { reason: tree.reason })}</p>
      )}

      {view === 'changes' && tree.kind === 'ready' && changes.length === 0 && (
        <p className={css.placeholder}>{t('status.clean')}</p>
      )}

      {view === 'changes' && changes.length > 0 && (
        <ul className={css.changes}>
          {changes.map(change => (
            <li
              key={change.path}
              className={clsx(css.change, change.absolutePath === openPath && css.changeOpen)}
            >
              {/* Selecting a row shows what changed, which is the question a
                  reviewer asks first; opening the file in the editor is the
                  separate action beside it. */}
              <button
                type="button"
                className={css.path}
                title={change.path}
                aria-expanded={openDiff === change.path}
                onClick={() => {
                  setOpenDiff(current => current === change.path ? undefined : change.path)
                }}
              >
                <span className={clsx(css.mark, isStaged(change) && css.markStaged)}>
                  {isStaged(change) ? 'S' : ' '}
                </span>
                <span className={css.name}>{change.path}</span>
                {!change.binary && change.insertions !== undefined && (
                  <span className={css.counts}>
                    +{change.insertions} -{change.deletions ?? 0}
                  </span>
                )}
              </button>
              <span className={css.actions}>
                <button
                  type="button"
                  className={css.action}
                  title={t('action.open')}
                  onClick={() => { openFile(change.absolutePath) }}
                >
                  {t('action.open')}
                </button>
                {isUnstaged(change) && (
                  <button
                    type="button"
                    className={css.action}
                    disabled={busy}
                    title={t('action.stage')}
                    onClick={() => {
                      void mutate(() => stage(repository as string, [change.path]))
                    }}
                  >
                    {t('action.stage')}
                  </button>
                )}
                {isStaged(change) && (
                  <button
                    type="button"
                    className={css.action}
                    disabled={busy}
                    title={t('action.unstage')}
                    onClick={() => {
                      void mutate(() => unstage(repository as string, [change.path]))
                    }}
                  >
                    {t('action.unstage')}
                  </button>
                )}
                <button
                  type="button"
                  className={css.action}
                  disabled={busy}
                  title={t('action.discard')}
                  onClick={() => {
                    setBusy(true)
                    setNotice(undefined)
                    discard(repository as string, change.path, isStaged(change) && !isUnstaged(change)).then(
                      (outcome) => {
                        setTree({ kind: 'ready', status: outcome.status })
                        // The discard rewrote the file; if the editor holds it,
                        // its buffer is now behind the working tree.
                        if (change.absolutePath === openPath) reloadBuffer()
                        if (outcome.recoveredOid !== undefined) {
                          setRecovery({ path: change.path, oid: outcome.recoveredOid })
                        }
                      },
                      (error: unknown) => { setNotice(failureText(error)) },
                    ).finally(() => { setBusy(false) })
                  }}
                >
                  {t('action.discard')}
                </button>
              </span>
              {openDiff === change.path && (
                <div className={css.diff}>
                  {diffState.kind === 'loading' && (
                    <p className={css.note} role="status">{t('diff.loading')}</p>
                  )}
                  {diffState.kind === 'binary' && (
                    <p className={css.note}>{t('diff.binary')}</p>
                  )}
                  {diffState.kind === 'failed' && (
                    <p className={css.note} role="status">
                      {t('diff.failed', { reason: diffState.reason })}
                    </p>
                  )}
                  {diffState.kind === 'ready' && <DiffBlock diffs={diffState.hunks} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {view === 'changes' && tree.kind === 'ready' && tree.status.truncated && (
        <p className={css.note}>{t('status.truncated')}</p>
      )}

      {/* A discard destroys uncommitted work. The host preserved it before
          restoring, so the panel says where it went rather than letting the
          change vanish silently. */}
      {recovery !== undefined && (
        <div className={css.recovery} role="status">
          <span>{t('recovery.kept', { path: recovery.path, id: recovery.oid.slice(0, 8) })}</span>
          <button type="button" className={css.action} onClick={() => { setRecovery(undefined) }}>
            {t('recovery.dismiss')}
          </button>
        </div>
      )}

      {notice !== undefined && <p className={css.note} role="status">{notice}</p>}

      {view === 'changes' && changes.length > 0 && (
        <div className={css.commit}>
          <textarea
            className={css.message}
            rows={2}
            value={message}
            placeholder={t('commit.placeholder')}
            aria-label={t('commit.placeholder')}
            onChange={(event) => { setMessage(event.target.value) }}
          />
          <div className={css.commitRow}>
            <button
              type="button"
              className={css.action}
              disabled={busy || stagedCount === 0 || message.trim().length === 0}
              onClick={() => {
                void mutate(async () => {
                  const outcome = await commit(repository as string, message)
                  setMessage('')
                  return outcome.status
                })
              }}
            >
              {t('commit.now', { count: String(stagedCount) })}
            </button>
            {/* The same commit, asked of the session's agent instead: the turn
                is recorded in the session log, which a direct button is not. */}
            <button
              type="button"
              className={css.action}
              disabled={busy || stagedCount === 0 || message.trim().length === 0}
              title={t('commit.viaAgentHint')}
              onClick={() => {
                setBusy(true)
                setNotice(undefined)
                requestCommit(repository as string, message).then(
                  () => { setMessage('') },
                  (error: unknown) => { setNotice(failureText(error)) },
                ).finally(() => { setBusy(false) })
              }}
            >
              {t('commit.viaAgent')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
