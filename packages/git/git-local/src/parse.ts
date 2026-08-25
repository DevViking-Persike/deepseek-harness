/**
 * Parsers for the machine-readable Git formats the local provider requests.
 * Kept apart from process execution so every format rule is testable against
 * recorded output without spawning `git`.
 * @module @deepseek-ai/dsh-git-local/parse
 */

import type { GitChangeKind, GitCommit } from '@deepseek-ai/dsh-git'

/** One `--porcelain=v2 -z` entry, before absolute paths are attached. */
export interface StatusEntry {
  readonly path: string
  readonly index: GitChangeKind
  readonly worktree: GitChangeKind
  readonly origPath?: string
  readonly similarity?: number
}

/** Branch facts carried by the `# branch.*` headers. */
export interface StatusHeaders {
  readonly branch?: string
  readonly head?: string
  readonly upstream?: string
  readonly ahead: number
  readonly behind: number
}

/** One parsed `--porcelain=v2 --branch -z` output. */
export interface StatusOutput {
  readonly headers: StatusHeaders
  readonly entries: readonly StatusEntry[]
}

/**
 * Map one `porcelain=v2` XY status letter onto the seam's closed union. Git
 * documents this alphabet as fixed; an unknown letter reads as `modified`
 * rather than widening the union, because "something changed here" is the one
 * fact every unknown letter still asserts.
 */
function changeKind(letter: string): GitChangeKind {
  switch (letter) {
    case '.': return 'unmodified'
    case 'A': return 'added'
    case 'M': return 'modified'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case 'T': return 'typechange'
    case 'U': return 'conflicted'
    default: return 'modified'
  }
}

/**
 * Parse the `# branch.ab +A -B` header. Git omits this header entirely when
 * the branch has no upstream, so an absent header is zero/zero rather than a
 * parse failure.
 */
function aheadBehind(value: string): { ahead: number; behind: number } {
  const match = /^\+(\d+)\s+-(\d+)$/.exec(value.trim())
  if (match === null) return { ahead: 0, behind: 0 }
  return { ahead: Number(match[1]), behind: Number(match[2]) }
}

/**
 * Parse `git status --porcelain=v2 --branch -z`.
 *
 * The `-z` framing is what makes this safe for paths containing spaces,
 * newlines, or quotes: records are NUL-separated and paths are never quoted or
 * escaped. Rename and copy entries (`2`) spend TWO records — the entry line
 * ending in the new path, then the original path — so the reader advances an
 * extra record for them instead of treating the original path as a new entry.
 *
 * @param stdout - raw NUL-framed status output.
 * @returns the branch headers and one entry per changed path.
 */
export function parseStatus(stdout: string): StatusOutput {
  // A trailing NUL leaves an empty final record; dropping empties also
  // tolerates the empty output of a clean repository.
  const records = stdout.split('\0').filter(record => record.length > 0)
  const entries: StatusEntry[] = []
  let branch: string | undefined
  let head: string | undefined
  let upstream: string | undefined
  let ahead = 0
  let behind = 0

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]
    if (record === undefined) continue

    if (record.startsWith('# ')) {
      const [key, ...rest] = record.slice(2).split(' ')
      const value = rest.join(' ')
      if (key === 'branch.head' && value !== '(detached)') branch = value
      // An unborn branch reports `(initial)`, which is the absence of a
      // commit rather than an object id.
      else if (key === 'branch.oid' && value !== '(initial)') head = value
      else if (key === 'branch.upstream') upstream = value
      else if (key === 'branch.ab') ({ ahead, behind } = aheadBehind(value))
      continue
    }

    const kind = record[0]
    if (kind === '?') {
      entries.push({ path: record.slice(2), index: 'unmodified', worktree: 'untracked' })
      continue
    }
    if (kind === '!') {
      entries.push({ path: record.slice(2), index: 'unmodified', worktree: 'ignored' })
      continue
    }
    if (kind === 'u') {
      // Unmerged: both sides are the conflict, whatever the stage letters say.
      const path = record.split(' ').slice(10).join(' ')
      entries.push({ path, index: 'conflicted', worktree: 'conflicted' })
      continue
    }
    if (kind !== '1' && kind !== '2') continue

    const fields = record.split(' ')
    const xy = fields[1] ?? '..'
    const index = changeKind(xy[0] ?? '.')
    const worktree = changeKind(xy[1] ?? '.')

    if (kind === '1') {
      // Ordinary entry: 8 fixed fields, then the path, which may itself
      // contain spaces and is therefore everything that remains.
      entries.push({ path: fields.slice(8).join(' '), index, worktree })
      continue
    }

    // Rename/copy: 9 fixed fields (the ninth is `R100`/`C75`), then the new
    // path; the ORIGINAL path is the next NUL record.
    const score = fields[8] ?? ''
    const similarity = Number(score.slice(1))
    const path = fields.slice(9).join(' ')
    const origPath = records[i + 1] ?? ''
    i += 1
    entries.push({
      path,
      index,
      worktree,
      origPath,
      ...Number.isFinite(similarity) ? { similarity } : {},
    })
  }

  return {
    headers: {
      ...branch === undefined ? {} : { branch },
      ...head === undefined ? {} : { head },
      ...upstream === undefined ? {} : { upstream },
      ahead,
      behind,
    },
    entries,
  }
}

/** Line counts for one path, as `--numstat` reports them. */
export interface NumstatEntry {
  readonly path: string
  readonly binary: boolean
  readonly insertions?: number
  readonly deletions?: number
}

/**
 * Parse `git diff --numstat -z`.
 *
 * Two format rules decide this reader. A binary file reports `-` for both
 * counts, which carries no line information at all rather than zero lines. A
 * rename spends THREE NUL records — the counts line ends after the tab with an
 * empty path, then the original path, then the new path — so the reader
 * attributes the counts to the new path.
 *
 * @param stdout - raw NUL-framed numstat output.
 * @returns one entry per path that differs.
 */
export function parseNumstat(stdout: string): readonly NumstatEntry[] {
  const records = stdout.split('\0')
  const entries: NumstatEntry[] = []

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]
    if (record === undefined || record.length === 0) continue
    const firstTab = record.indexOf('\t')
    if (firstTab < 0) continue
    const secondTab = record.indexOf('\t', firstTab + 1)
    if (secondTab < 0) continue

    const added = record.slice(0, firstTab)
    const removed = record.slice(firstTab + 1, secondTab)
    let path = record.slice(secondTab + 1)
    if (path.length === 0) {
      // Rename: the original path and the new path follow as their own
      // records, and the counts belong to the new path.
      path = records[i + 2] ?? ''
      i += 2
    }
    if (path.length === 0) continue

    // `-` means binary: Git has no line counts to give, which is different
    // from a file whose counts are genuinely zero.
    if (added === '-' || removed === '-') {
      entries.push({ path, binary: true })
      continue
    }
    entries.push({
      path,
      binary: false,
      insertions: Number(added),
      deletions: Number(removed),
    })
  }
  return entries
}

/** One `worktree list --porcelain -z` entry, before display fields are derived. */
export interface WorktreeEntry {
  readonly path: string
  readonly branch?: string
  readonly head?: string
  readonly detached: boolean
  readonly bare: boolean
  readonly locked?: string
  readonly prunable?: string
}

/**
 * Parse `git worktree list --porcelain -z`.
 *
 * Each attribute is its own NUL record and a blank record closes one
 * worktree's block. `branch` carries a fully qualified `refs/heads/` ref;
 * `detached`, `bare`, `locked`, and `prunable` are flags that may carry a
 * reason. A locked worktree without a stated reason emits the bare flag, which
 * must still read as locked — that is the distinction deciding whether a UI
 * may offer removal.
 *
 * @param stdout - raw NUL-framed worktree output.
 * @returns one entry per checkout, in Git's order (main working tree first).
 */
export function parseWorktrees(stdout: string): readonly WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: {
    path: string
    branch?: string
    head?: string
    detached: boolean
    bare: boolean
    locked?: string
    prunable?: string
  } | undefined

  const flush = (): void => {
    if (current === undefined) return
    entries.push({
      path: current.path,
      ...current.branch === undefined ? {} : { branch: current.branch },
      ...current.head === undefined ? {} : { head: current.head },
      detached: current.detached,
      bare: current.bare,
      ...current.locked === undefined ? {} : { locked: current.locked },
      ...current.prunable === undefined ? {} : { prunable: current.prunable },
    })
    current = undefined
  }

  for (const record of stdout.split('\0')) {
    if (record.length === 0) {
      flush()
      continue
    }
    const space = record.indexOf(' ')
    const key = space < 0 ? record : record.slice(0, space)
    const value = space < 0 ? '' : record.slice(space + 1)

    if (key === 'worktree') {
      flush()
      current = { path: value, detached: false, bare: false }
      continue
    }
    /* v8 ignore next -- unreachable: git always opens a block with `worktree`. */
    if (current === undefined) continue
    if (key === 'HEAD') current.head = value
    // The porcelain ref is fully qualified; a UI shows the short name.
    else if (key === 'branch') current.branch = value.replace(/^refs\/heads\//, '')
    else if (key === 'detached') current.detached = true
    else if (key === 'bare') current.bare = true
    else if (key === 'locked') current.locked = value
    else if (key === 'prunable') current.prunable = value
  }
  flush()
  return entries
}

/** Unit separator between graph fields; a commit message cannot contain it. */
export const GRAPH_FIELD_SEP = '\u001f'
/** Record separator between graph commits. */
export const GRAPH_RECORD_SEP = '\u001e'

/** One parsed graph commit, before display fields are derived. */
export interface GraphEntry {
  readonly id: string
  readonly parents: readonly string[]
  readonly refs: readonly string[]
  readonly authorName: string
  readonly authoredAt: string
  readonly subject: string
}

/**
 * Parse the graph `--format` this provider requests: id, parents, decoration,
 * author, date, subject, separated by US and terminated by RS. Both are
 * control characters no commit message carries, so a subject with newlines
 * cannot break the framing.
 *
 * `%D` decoration arrives as a comma-separated list that may carry
 * `HEAD -> main`; the arrow form is split so a lane label is the branch name
 * alone. Parents are what give a merge its several lanes, so an empty parent
 * field is a root commit rather than a malformed record.
 *
 * @param stdout - raw RS-framed graph output.
 * @returns one entry per commit, in the order Git emitted them.
 */
export function parseGraph(stdout: string): readonly GraphEntry[] {
  const entries: GraphEntry[] = []
  for (const record of stdout.split(GRAPH_RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, '')
    if (trimmed.length === 0) continue
    const [id, parents, refs, authorName, authoredAt, subject] = trimmed.split(GRAPH_FIELD_SEP)
    if (id === undefined || id.length === 0) continue
    entries.push({
      id,
      parents: (parents ?? '').split(' ').filter(part => part.length > 0),
      refs: (refs ?? '')
        .split(',')
        .map(ref => ref.trim())
        // `HEAD -> main` names one branch; the lane label is that branch.
        .map(ref => ref.startsWith('HEAD -> ') ? ref.slice('HEAD -> '.length) : ref)
        .filter(ref => ref.length > 0 && ref !== 'HEAD'),
      authorName: authorName ?? '',
      authoredAt: authoredAt ?? '',
      subject: subject ?? '',
    })
  }
  return entries
}

/** One branch row of `for-each-ref`, before display fields are derived. */
export interface BranchEntry {
  readonly name: string
  readonly head: string
  readonly upstream?: string
  readonly current: boolean
}

/**
 * Parse the `for-each-ref` format this provider requests: name, object id,
 * upstream, and the `*` marker Git writes for the checked-out branch. Fields
 * are NUL-separated and rows newline-separated.
 *
 * @param stdout - raw for-each-ref output.
 * @returns one entry per local branch.
 */
export function parseBranches(stdout: string): readonly BranchEntry[] {
  const entries: BranchEntry[] = []
  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue
    const [name, head, upstream, marker] = line.split('\0')
    if (name === undefined || name.length === 0) continue
    entries.push({
      name,
      head: head ?? '',
      ...upstream === undefined || upstream.length === 0 ? {} : { upstream },
      current: marker === '*',
    })
  }
  return entries
}

/**
 * Parse `rev-list --left-right --count A...B`, whose two counts are
 * tab-separated: the left is what A has and B does not, the right the reverse.
 * The provider asks with the base on the left, so left is `behind`.
 *
 * @param stdout - raw count output.
 * @returns the behind/ahead pair, or undefined when the output is unusable.
 */
export function parseDivergence(stdout: string): { behind: number; ahead: number } | undefined {
  const match = /^(\d+)\s+(\d+)$/.exec(stdout.trim())
  if (match === null) return undefined
  return { behind: Number(match[1]), ahead: Number(match[2]) }
}

/** Field separator inside one log record. */
export const LOG_FIELD_SEP = '\u0000'
/** Record separator between log commits. */
export const LOG_RECORD_SEP = '\u001e'

/**
 * Parse the fixed `--format` this provider requests, whose fields are
 * NUL-separated and whose commits are separated by RS. Both separators are
 * control characters a commit message cannot contain, so a subject with
 * newlines, tabs, or quotes cannot break the framing.
 *
 * @param stdout - raw log output.
 * @returns the commits in the order Git emitted them (newest first).
 */
export function parseLog(stdout: string): readonly GitCommit[] {
  const commits: GitCommit[] = []
  for (const record of stdout.split(LOG_RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, '')
    if (trimmed.length === 0) continue
    const fields = trimmed.split(LOG_FIELD_SEP)
    const [id, authorName, authorEmail, authoredAt, subject, parents] = fields
    if (id === undefined || id.length === 0) continue
    commits.push({
      id,
      subject: subject ?? '',
      authorName: authorName ?? '',
      authorEmail: authorEmail ?? '',
      authoredAt: authoredAt ?? '',
      parents: (parents ?? '').split(' ').filter(part => part.length > 0),
    })
  }
  return commits
}
