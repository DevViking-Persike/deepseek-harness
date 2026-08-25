/**
 * Local Git repository section: lists discovered repositories in open workspaces
 * and presents summary status, branch tracking, and changed files.
 */
import clsx from 'clsx'
import { useCallback, useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-repositories/client'
import css from './RepositoryLocalSection.module.css'

/** Marker for a Git RPC domain the host does not mount. */
export class GitUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitUnavailable'
  }
}

/** One repository discovered in the workspace. */
export interface GitRepositoryRow {
  root: string
  name: string
  workspaceTitle: string
  submodule: boolean
}

/** One changed path in the working tree. */
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

/** One repository's working tree status view. */
export interface GitStatusView {
  root: string
  branch?: string
  upstream?: string
  ahead: number
  behind: number
  changes: readonly GitChangeRow[]
  truncated: boolean
}

/** Injected wire calls for local repository inspection. */
export interface RepositoryLocalInjected {
  readonly listRepositories: (signal: AbortSignal) => Promise<readonly GitRepositoryRow[]>
  readonly status: (root: string, signal: AbortSignal) => Promise<GitStatusView>
}

/** Props passed to RepositoryLocalSection. */
export type RepositoryLocalProps =
  PropsRuntime<'conversation.view.repositories.section'>
  & InjectFace<RepositoryLocalInjected>
  & PropsLocale<'repository-local'>

type SectionState =
  | { kind: 'loading' }
  | { kind: 'ready'; repositories: readonly GitRepositoryRow[] }
  | { kind: 'empty' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'failed'; message: string }

export function RepositoryLocalSection({
  listRepositories,
  status,
  t,
}: RepositoryLocalProps) {
  const [state, setState] = useState<SectionState>({ kind: 'loading' })
  const [selectedRoot, setSelectedRoot] = useState<string | undefined>(undefined)
  const [statusMap, setStatusMap] = useState<Record<string, GitStatusView | 'loading' | 'error'>>({})
  const [refreshTick, setRefreshTick] = useState(0)

  const reload = useCallback(() => {
    setRefreshTick(c => c + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setState({ kind: 'loading' })
    listRepositories(controller.signal)
      .then((repositories) => {
        if (controller.signal.aborted) return
        if (repositories.length === 0) {
          setState({ kind: 'empty' })
          setSelectedRoot(undefined)
        } else {
          setState({ kind: 'ready', repositories })
          setSelectedRoot(prev => (prev !== undefined && repositories.some(r => r.root === prev) ? prev : repositories[0]?.root))
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error instanceof GitUnavailable) {
          setState({ kind: 'unavailable', message: error.message })
        } else {
          setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) })
        }
      })
    return () => { controller.abort() }
  }, [listRepositories, refreshTick])

  // Fetch status for the selected repository
  useEffect(() => {
    if (!selectedRoot || state.kind !== 'ready') return
    const controller = new AbortController()
    setStatusMap(prev => ({ ...prev, [selectedRoot]: 'loading' }))
    status(selectedRoot, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setStatusMap(prev => ({ ...prev, [selectedRoot]: res }))
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatusMap(prev => ({ ...prev, [selectedRoot]: 'error' }))
      })
    return () => { controller.abort() }
  }, [selectedRoot, state.kind, status, refreshTick])

  if (state.kind === 'loading') {
    return (
      <div className={css.noticeBox}>
        <p className={css.noticeDescription}>{t('header.description')}...</p>
      </div>
    )
  }

  if (state.kind === 'unavailable') {
    return (
      <div className={css.noticeBox}>
        <h3 className={css.noticeTitle}>{t('unavailable.title')}</h3>
        <p className={css.noticeDescription}>{state.message || t('unavailable.description')}</p>
      </div>
    )
  }

  if (state.kind === 'empty') {
    return (
      <div className={css.noticeBox}>
        <h3 className={css.noticeTitle}>{t('empty.title')}</h3>
        <p className={css.noticeDescription}>{t('empty.description')}</p>
        <button type="button" className={css.retryButton} onClick={reload}>
          {t('actions.refresh')}
        </button>
      </div>
    )
  }

  if (state.kind === 'failed') {
    return (
      <div className={css.noticeBox}>
        <h3 className={css.noticeTitle}>{t('error.title')}</h3>
        <p className={css.noticeDescription}>{state.message}</p>
        <button type="button" className={css.retryButton} onClick={reload}>
          {t('error.retry')}
        </button>
      </div>
    )
  }

  const selectedRepo = state.repositories.find(r => r.root === selectedRoot)
  const currentStatus = selectedRoot ? statusMap[selectedRoot] : undefined

  return (
    <div className={css.root}>
      <div className={css.topBar}>
        <div className={css.sectionHeader}>
          <h3 className={css.title}>{t('header.title')}</h3>
          <p className={css.description}>{t('header.description')}</p>
        </div>
        <button type="button" className={css.refreshButton} onClick={reload}>
          {t('actions.refresh')}
        </button>
      </div>

      <div className={css.layout}>
        <div className={css.repoList}>
          {state.repositories.map((repo) => {
            const isSelected = repo.root === selectedRoot
            return (
              <button
                key={repo.root}
                type="button"
                className={clsx(css.repoCard, isSelected && css.repoCardActive)}
                onClick={() => setSelectedRoot(repo.root)}
              >
                <div className={css.repoCardHeader}>
                  <span className={css.repoName} title={repo.name}>{repo.name}</span>
                  {repo.submodule && (
                    <span className={css.submoduleBadge}>{t('repo.submodule')}</span>
                  )}
                </div>
                <div className={css.repoMeta}>
                  <span>{t('repo.workspace')}: {repo.workspaceTitle}</span>
                  <span className={css.repoPath} title={repo.root}>{repo.root}</span>
                </div>
              </button>
            )
          })}
        </div>

        <div className={css.detailsPanel}>
          {selectedRepo && currentStatus && currentStatus !== 'loading' && currentStatus !== 'error' ? (
            <>
              <div className={css.detailsHeader}>
                <span className={css.detailsTitle}>{selectedRepo.name}</span>
                {currentStatus.changes.length === 0 ? (
                  <span className={css.statusBadgeClean}>{t('status.clean')}</span>
                ) : (
                  <span className={css.statusBadgeDirty}>
                    {t('status.dirty')} ({currentStatus.changes.length})
                  </span>
                )}
              </div>

              <div className={css.statusGrid}>
                <div className={css.statusItem}>
                  <span className={css.statusLabel}>{t('status.branch')}</span>
                  <span className={css.statusValue}>
                    {currentStatus.branch ?? t('status.detached')}
                  </span>
                </div>
                <div className={css.statusItem}>
                  <span className={css.statusLabel}>{t('status.upstream')}</span>
                  <span className={css.statusValue}>
                    {currentStatus.upstream ?? '-'}
                  </span>
                </div>
                {(currentStatus.ahead > 0 || currentStatus.behind > 0) && (
                  <div className={css.statusItem}>
                    <span className={css.statusLabel}>{t('status.ahead')} / {t('status.behind')}</span>
                    <span className={css.statusValue}>
                      +{currentStatus.ahead} / -{currentStatus.behind}
                    </span>
                  </div>
                )}
                <div className={css.statusItem}>
                  <span className={css.statusLabel}>{t('status.changes')}</span>
                  <span className={css.statusValue}>
                    {currentStatus.changes.length} {t('status.changes')}
                  </span>
                </div>
              </div>

              {currentStatus.changes.length > 0 && (
                <div className={css.changesList}>
                  {currentStatus.changes.map((c) => {
                    const isStaged = c.index !== 'unmodified' && c.index !== 'untracked'
                    const isUnstaged = c.worktree !== 'unmodified' && c.worktree !== 'untracked'
                    const isUntracked = c.worktree === 'untracked' || c.index === 'untracked'
                    return (
                      <div key={c.path} className={css.changeRow}>
                        <span className={css.changePath} title={c.path}>{c.path}</span>
                        <div className={css.changeTags}>
                          {isStaged && <span className={clsx(css.changeBadge, css.changeBadgeAdded)}>{t('status.staged')}</span>}
                          {isUnstaged && <span className={clsx(css.changeBadge, css.changeBadgeModified)}>{t('status.unstaged')}</span>}
                          {isUntracked && <span className={clsx(css.changeBadge, css.changeBadgeUntracked)}>{t('status.untracked')}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div className={css.noticeBox}>
              <p className={css.noticeDescription}>
                {currentStatus === 'loading'
                  ? `${t('header.description')}...`
                  : currentStatus === 'error'
                    ? t('error.title')
                    : t('details.selectHint')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
