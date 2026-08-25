/**
 * `GitProvider` backed by the local `git` CLI, executed through
 * `ctx.subprocess`. The CLI is the backend rather than a JavaScript Git
 * implementation because the index format, rename detection, `.gitattributes`
 * filters, and worktree/submodule resolution are the parts a reimplementation
 * diverges on at every Git release — and this seam's whole value is agreeing
 * with the `git` the user runs in their own terminal.
 * @module @deepseek-ai/dsh-git-local/provider
 */

import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle, SubprocessOutputReader } from '@deepseek-ai/dsh-subprocess'
import type {
  GitCommit,
  GitBaseComparison,
  GitBaseRequest,
  GitGraph,
  GitGraphRequest,
  GitCommitRequest,
  GitDiff,
  GitDiffRequest,
  GitDiscardRequest,
  GitDiscardResult,
  GitDiscoverRequest,
  GitDiscoverResult,
  GitFileChange,
  GitLogRequest,
  GitProvider,
  GitStageRequest,
  GitStatus,
  GitWorktree,
} from '@deepseek-ai/dsh-git'
import { GitError } from '@deepseek-ai/dsh-git'
import {
  parseBranches, parseDivergence, parseGraph, parseLog, parseNumstat, parseStatus, parseWorktrees,
} from './parse.ts'
import { discoverRepositories } from './discover.ts'

/** Registry id of the local CLI backend. */
export const LOCAL_GIT_PROVIDER_ID = 'local'

/**
 * The `--format` every history read requests. Fields are NUL-separated and
 * commits RS-separated, both control characters a commit message cannot
 * contain, so no subject can break the framing.
 */
const LOG_FORMAT = ['%H', '%an', '%ae', '%aI', '%s', '%P'].join('%x00') + '%x1e'

/**
 * The graph `--format`: id, parents, decoration, author, date, subject. Fields
 * are US-separated and commits RS-terminated — control characters no commit
 * message carries, so framing survives any subject.
 */
const GRAPH_FORMAT = ['%H', '%P', '%D', '%an', '%aI', '%s'].join('%x1f') + '%x1e'

/** The branch listing format: name, object id, upstream, and the HEAD marker. */
const BRANCH_FORMAT = ['%(refname:short)', '%(objectname)', '%(upstream:short)', '%(HEAD)'].join('%00')

/** Execution limits this backend applies to every CLI invocation. */
export interface LocalGitLimits {
  /** Executable name or absolute path of the Git CLI. */
  readonly cli: string
  /** Cooperative timeout for one read (status, diff, log, discovery). */
  readonly readTimeoutMs: number
  /** Cooperative timeout for one mutation (stage, unstage, discard, commit). */
  readonly writeTimeoutMs: number
  /** Cap on collected stdout bytes of one invocation. */
  readonly maxOutputBytes: number
  /** Termination grace period handed to the subprocess seam. */
  readonly graceMs: number
  /** Largest number of changed paths one status reports before truncating. */
  readonly maxChanges: number
}

/** Settled output of one CLI invocation. */
interface CliOutcome {
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
}

/**
 * Read one settled stream in full. After settlement `readFrom(0)` is the batch
 * result, and its `lossy` flag is exactly the "the tail window dropped older
 * bytes" fact this backend reports as truncation.
 */
function read(reader: SubprocessOutputReader): { text: string; truncated: boolean } {
  const chunk = reader.readFrom(0)
  return { text: chunk.text, truncated: chunk.lossy }
}

/**
 * Prove a repository-relative path stays inside its repository. The seam's
 * callers supply paths that reached them over a wire, so a `..` segment or an
 * absolute path must be refused here rather than handed to the CLI, which
 * would happily address a file outside the repository.
 *
 * @param root - absolute working-tree root.
 * @param path - repository-relative path to check.
 * @returns the absolute path of the target.
 * @throws {GitError} `GIT_OUTSIDE_REPOSITORY` when the path escapes the root.
 */
export function resolveInside(root: string, path: string): string {
  if (isAbsolute(path)) {
    throw new GitError(`"${path}" must be repository-relative`, 'GIT_OUTSIDE_REPOSITORY')
  }
  const absolute = resolve(root, path)
  if (absolute !== root && !absolute.startsWith(root.endsWith(sep) ? root : root + sep)) {
    throw new GitError(`"${path}" is outside the repository`, 'GIT_OUTSIDE_REPOSITORY')
  }
  return absolute
}

/**
 * The local Git CLI backend. Every operation is one short-lived,
 * non-shell-interpreted `git` invocation: arguments reach the executable as a
 * fixed argv, so a branch name or a path can never be interpreted as a flag or
 * a shell fragment. Every path argument is additionally passed after `--`, so
 * a file named like an option is still treated as a path.
 */
export class LocalGitProvider implements GitProvider {
  readonly id = LOCAL_GIT_PROVIDER_ID

  constructor(private readonly ctx: Context, private readonly limits: LocalGitLimits) {}

  /**
   * Run one `git` invocation and collect its output.
   * @param cwd - working directory the invocation runs in.
   * @param args - arguments after the executable; never shell-interpreted.
   * @param timeoutMs - cooperative timeout for this invocation.
   * @param signal - caller cancellation, combined with the timeout.
   * @returns the settled exit facts and collected output.
   */
  private async cli(
    cwd: string,
    args: readonly string[],
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<CliOutcome> {
    const timeout = AbortSignal.timeout(timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const collect = { maxBytes: this.limits.maxOutputBytes }
    let handle: SubprocessHandle
    try {
      handle = this.ctx.subprocess.spawn({
        argv: [this.limits.cli, ...args],
        cwd,
        stdio: { stdin: 'ignore', stdout: collect, stderr: collect },
        graceMs: this.limits.graceMs,
        signal: combined,
        // A pager would never exit, and locale-dependent messages would make
        // failure classification depend on the user's language.
        env: { GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      })
    } catch (cause) {
      throw new GitError(`failed to launch "${this.limits.cli}"`, 'GIT_FAILED', { cause })
    }
    let outcome: Awaited<typeof handle.done>
    try {
      outcome = await handle.done
    } catch (cause) {
      throw new GitError(`"${this.limits.cli}" did not run`, 'GIT_FAILED', { cause })
    }
    const { stdout, stderr } = handle.collected
    /* v8 ignore start -- both streams were requested in collect mode, so the seam always exposes their readers. */
    if (stdout === undefined || stderr === undefined) {
      throw new GitError('subprocess dropped a requested collect stream', 'GIT_FAILED')
    }
    /* v8 ignore stop */
    if (timeout.aborted) {
      throw new GitError(`git ${args[0] ?? ''} timed out after ${timeoutMs}ms`, 'GIT_FAILED')
    }
    const out = read(stdout)
    const err = read(stderr)
    return { exitCode: outcome.exitCode, stdout: out.text, stderr: err.text, truncated: out.truncated }
  }

  /**
   * Run a CLI invocation that must succeed, classifying a non-zero exit.
   * @param cwd - working directory the invocation runs in.
   * @param args - arguments after the executable.
   * @param timeoutMs - cooperative timeout for this invocation.
   * @param signal - caller cancellation.
   * @returns the successful invocation's output.
   */
  private async run(
    cwd: string,
    args: readonly string[],
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<CliOutcome> {
    const result = await this.cli(cwd, args, timeoutMs, signal)
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim()
      throw new GitError(
        `git ${args.join(' ')} failed: ${detail || `exit ${String(result.exitCode)}`}`,
        classify(detail),
      )
    }
    return result
  }

  async available(): Promise<boolean> {
    try {
      const result = await this.cli(process.cwd(), ['--version'], this.limits.readTimeoutMs)
      return result.exitCode === 0
    } catch {
      // A machine without `git` is a selection fact, not a failure to report:
      // the seam skips this provider and raises its own selection error.
      return false
    }
  }

  async discover(request: GitDiscoverRequest, signal?: AbortSignal): Promise<GitDiscoverResult> {
    return discoverRepositories(request, signal)
  }

  async worktrees(root: string, signal?: AbortSignal): Promise<readonly GitWorktree[]> {
    const result = await this.run(
      root,
      ['worktree', 'list', '--porcelain', '-z'],
      this.limits.readTimeoutMs,
      signal,
    )
    // Git lists the main working tree first and linked ones after, so the
    // first entry is the main checkout without needing a second query.
    return parseWorktrees(result.stdout).map((entry, index) => ({
      path: entry.path,
      name: basename(entry.path),
      ...entry.branch === undefined ? {} : { branch: entry.branch },
      ...entry.head === undefined ? {} : { head: entry.head },
      main: index === 0,
      detached: entry.detached,
      bare: entry.bare,
      ...entry.locked === undefined ? {} : { locked: entry.locked },
      ...entry.prunable === undefined ? {} : { prunable: entry.prunable },
    }))
  }

  async status(root: string, signal?: AbortSignal): Promise<GitStatus> {
    const result = await this.run(
      root,
      ['status', '--porcelain=v2', '--branch', '-z'],
      this.limits.readTimeoutMs,
      signal,
    )
    const { headers, entries } = parseStatus(result.stdout)

    // Line counts come from a separate pair of reads: `status` reports which
    // paths changed, never by how much. Both sides are asked for because a
    // path can be staged and edited again, and the two counts differ.
    const [staged, unstaged] = await Promise.all([
      this.numstat(root, ['diff', '--cached', '--numstat', '-z'], signal),
      this.numstat(root, ['diff', '--numstat', '-z'], signal),
    ])

    const capped = entries.slice(0, this.limits.maxChanges)
    const changes: GitFileChange[] = capped.map((entry) => {
      // The worktree count describes the unstaged side; the staged count
      // describes the index side. A path present in only one is reported by
      // that one, so a staged-only change still carries its line counts.
      const counts = unstaged.get(entry.path) ?? staged.get(entry.path)
      return {
        path: entry.path,
        absolutePath: join(root, entry.path),
        index: entry.index,
        worktree: entry.worktree,
        ...entry.origPath === undefined ? {} : { origPath: entry.origPath },
        ...entry.similarity === undefined ? {} : { similarity: entry.similarity },
        binary: counts?.binary ?? false,
        ...counts?.insertions === undefined ? {} : { insertions: counts.insertions },
        ...counts?.deletions === undefined ? {} : { deletions: counts.deletions },
      }
    })

    return {
      root,
      ...headers.branch === undefined ? {} : { branch: headers.branch },
      ...headers.head === undefined ? {} : { head: headers.head },
      ...headers.upstream === undefined ? {} : { upstream: headers.upstream },
      ahead: headers.ahead,
      behind: headers.behind,
      changes,
      truncated: entries.length > capped.length || result.truncated,
    }
  }

  /** Read one side's line counts, keyed by repository-relative path. */
  private async numstat(
    root: string,
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<Map<string, { binary: boolean; insertions?: number; deletions?: number }>> {
    const result = await this.run(root, args, this.limits.readTimeoutMs, signal)
    const counts = new Map<string, { binary: boolean; insertions?: number; deletions?: number }>()
    for (const entry of parseNumstat(result.stdout)) {
      counts.set(entry.path, {
        binary: entry.binary,
        ...entry.insertions === undefined ? {} : { insertions: entry.insertions },
        ...entry.deletions === undefined ? {} : { deletions: entry.deletions },
      })
    }
    return counts
  }

  async compareBases(request: GitBaseRequest, signal?: AbortSignal): Promise<readonly GitBaseComparison[]> {
    const { root, bases } = request
    const comparisons: GitBaseComparison[] = []
    for (const base of bases) {
      // A repository that simply has no `develop` is not a failure: it reports
      // the base as absent and the UI omits it.
      const resolved = await this.cli(root, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`], this.limits.readTimeoutMs, signal)
      if (resolved.exitCode !== 0) {
        comparisons.push({ base, exists: false, ahead: 0, behind: 0 })
        continue
      }
      // Base on the LEFT, so the left count is what the base has and this
      // branch does not — the "behind" that breaks a push.
      const counted = await this.cli(
        root,
        ['rev-list', '--left-right', '--count', `${base}...HEAD`],
        this.limits.readTimeoutMs,
        signal,
      )
      const divergence = counted.exitCode === 0 ? parseDivergence(counted.stdout) : undefined
      if (divergence === undefined) {
        // An unborn branch has no HEAD to compare; the base exists but the
        // question does not apply yet.
        comparisons.push({ base, exists: true, ahead: 0, behind: 0 })
        continue
      }
      comparisons.push({
        base,
        exists: true,
        ahead: divergence.ahead,
        behind: divergence.behind,
        // Only worth asking when the base moved: a branch that is not behind
        // cannot conflict with it.
        ...divergence.behind > 0
          ? { conflicts: await this.wouldConflict(root, base, signal) }
          : { conflicts: false },
      })
    }
    return comparisons
  }

  /**
   * Whether merging HEAD into `base` would conflict. `merge-tree` computes the
   * merge in the object database: it writes no working-tree file and moves no
   * ref, so asking before a push costs nothing and changes nothing.
   *
   * @param root - the checkout to compare.
   * @param base - branch the merge would target.
   * @param signal - cancellation for the underlying call.
   * @returns true when the merge would conflict.
   */
  private async wouldConflict(root: string, base: string, signal?: AbortSignal): Promise<boolean> {
    const merged = await this.cli(
      root,
      ['merge-tree', '--write-tree', base, 'HEAD'],
      this.limits.readTimeoutMs,
      signal,
    )
    // Git exits non-zero exactly when the merge does not apply cleanly.
    return merged.exitCode !== 0
  }

  async graph(request: GitGraphRequest, signal?: AbortSignal): Promise<GitGraph> {
    const { root, limit } = request
    if (!Number.isInteger(limit) || limit < 1) {
      throw new GitError('graph limit must be a positive integer', 'GIT_INVALID_REQUEST')
    }
    const [commits, branches] = await Promise.all([
      this.cli(
        root,
        // `--all` so branches other than HEAD appear; `--date-order` is what
        // makes the lanes read chronologically rather than by traversal.
        ['log', '--all', '--date-order', `-n${String(limit + 1)}`, `--format=${GRAPH_FORMAT}`],
        this.limits.readTimeoutMs,
        signal,
      ),
      this.cli(root, ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads'], this.limits.readTimeoutMs, signal),
    ])
    // A repository with no commits answers an empty graph rather than failing.
    if (commits.exitCode !== 0) {
      if (/does not have any commits|unknown revision/i.test(commits.stderr)) {
        return { commits: [], branches: [], truncated: false }
      }
      throw new GitError(`git log failed: ${commits.stderr.trim()}`, classify(commits.stderr))
    }
    const parsed = parseGraph(commits.stdout)
    // One extra commit was requested purely to detect truncation.
    const kept = parsed.slice(0, limit)
    return {
      commits: kept.map(entry => ({
        id: entry.id,
        parents: entry.parents,
        refs: entry.refs,
        subject: entry.subject,
        authorName: entry.authorName,
        authoredAt: entry.authoredAt,
      })),
      branches: branches.exitCode === 0
        ? parseBranches(branches.stdout).map(branch => ({
          name: branch.name,
          head: branch.head,
          ...branch.upstream === undefined ? {} : { upstream: branch.upstream },
          current: branch.current,
        }))
        : [],
      truncated: parsed.length > kept.length,
    }
  }

  async diff(request: GitDiffRequest, signal?: AbortSignal): Promise<GitDiff> {
    const { root, path, side } = request
    resolveInside(root, path)
    // Whole-file contents rather than a unified patch: the browser draws both
    // sides in full, and a consumer writing a hunk back needs exact bytes.
    const before = side === 'index'
      ? await this.showBlob(root, `HEAD:${path}`, signal)
      : await this.showBlob(root, `:${path}`, signal)
    const after = side === 'index'
      ? await this.showBlob(root, `:${path}`, signal)
      : await this.readWorktree(root, path)
    const binary = (before !== null && isBinary(before)) || (after !== null && isBinary(after))
    return {
      path,
      oldText: binary ? null : before,
      newText: binary ? null : after,
      binary,
    }
  }

  /**
   * Read one object's text, answering null when the object does not exist —
   * which is how an added file has no `before` and a deleted file no `after`.
   */
  private async showBlob(root: string, spec: string, signal?: AbortSignal): Promise<string | null> {
    const result = await this.cli(root, ['show', spec], this.limits.readTimeoutMs, signal)
    if (result.exitCode !== 0) return null
    return result.stdout
  }

  /**
   * Read a working-tree file's text, answering null when it is absent — which
   * is how a deleted file has no `after` side. Read straight from disk rather
   * than through the CLI: the bytes are already on this machine, and routing
   * them through `hash-object` would write an object as a side effect of a
   * read.
   */
  private async readWorktree(root: string, path: string): Promise<string | null> {
    try {
      return await readFile(resolveInside(root, path), 'utf8')
    } catch {
      // Absent or unreadable: the deleted side of a diff, not a fault.
      return null
    }
  }

  async log(request: GitLogRequest, signal?: AbortSignal): Promise<readonly GitCommit[]> {
    const { root, limit, path } = request
    if (!Number.isInteger(limit) || limit < 1) {
      throw new GitError('log limit must be a positive integer', 'GIT_INVALID_REQUEST')
    }
    const args = ['log', `-n${String(limit)}`, `--format=${LOG_FORMAT}`]
    if (path !== undefined) {
      resolveInside(root, path)
      // `--` terminates options, so a path named like a flag stays a path.
      args.push('--', path)
    }
    const result = await this.cli(root, args, this.limits.readTimeoutMs, signal)
    // A repository with no commits fails `log`; an empty history is an answer.
    if (result.exitCode !== 0) {
      if (/does not have any commits|unknown revision/i.test(result.stderr)) return []
      throw new GitError(`git log failed: ${result.stderr.trim()}`, classify(result.stderr))
    }
    return parseLog(result.stdout)
  }

  async readBlob(root: string, oid: string, signal?: AbortSignal): Promise<string> {
    if (!/^[0-9a-f]{4,64}$/.test(oid)) {
      throw new GitError(`"${oid}" is not an object id`, 'GIT_INVALID_REQUEST')
    }
    const result = await this.run(root, ['cat-file', 'blob', oid], this.limits.readTimeoutMs, signal)
    return result.stdout
  }

  async stage(request: GitStageRequest, signal?: AbortSignal): Promise<void> {
    const paths = this.checkedPaths(request)
    await this.run(
      request.root,
      ['add', '--', ...paths],
      this.limits.writeTimeoutMs,
      signal,
    )
  }

  async unstage(request: GitStageRequest, signal?: AbortSignal): Promise<void> {
    const paths = this.checkedPaths(request)
    // `restore --staged` leaves the working tree alone, which is precisely the
    // unstage gesture; `reset` would also be correct but carries modes that
    // can touch the worktree, and this operation must never do that.
    const result = await this.cli(
      request.root,
      ['restore', '--staged', '--', ...paths],
      this.limits.writeTimeoutMs,
      signal,
    )
    if (result.exitCode === 0) return
    // Before the first commit there is no HEAD to restore from, so the
    // equivalent unstage is removing the path from the index.
    if (/could not resolve HEAD|without a commit|unknown revision|ambiguous argument 'HEAD'/i.test(result.stderr)) {
      await this.run(request.root, ['rm', '--cached', '-r', '--', ...paths], this.limits.writeTimeoutMs, signal)
      return
    }
    throw new GitError(`git restore --staged failed: ${result.stderr.trim()}`, classify(result.stderr))
  }

  /** Validate every path of a staging request stays inside the repository. */
  private checkedPaths(request: GitStageRequest): readonly string[] {
    if (request.paths.length === 0) {
      throw new GitError('no paths given', 'GIT_INVALID_REQUEST')
    }
    for (const path of request.paths) resolveInside(request.root, path)
    return request.paths
  }

  async discard(request: GitDiscardRequest, signal?: AbortSignal): Promise<GitDiscardResult> {
    const { root, path, side } = request
    resolveInside(root, path)

    // Preserve the content being destroyed BEFORE destroying it. `hash-object
    // -w` writes the current bytes into the object database, so the discarded
    // work stays addressable afterwards instead of being lost. This is what
    // makes a discard undoable, which an editor's discard normally is not.
    const preserved = await this.cli(
      root,
      ['hash-object', '-w', '--', path],
      this.limits.writeTimeoutMs,
      signal,
    )
    const recoveredOid = preserved.exitCode === 0 ? preserved.stdout.trim() : ''

    const args = side === 'index'
      ? ['restore', '--staged', '--', path]
      : ['restore', '--worktree', '--', path]
    const result = await this.cli(root, args, this.limits.writeTimeoutMs, signal)
    if (result.exitCode !== 0) {
      // An untracked file has nothing to restore from; removing it is the
      // discard, and its content is already preserved above.
      if (/did not match any file|pathspec/i.test(result.stderr)) {
        await this.run(root, ['clean', '-f', '--', path], this.limits.writeTimeoutMs, signal)
      } else {
        throw new GitError(`git restore failed: ${result.stderr.trim()}`, classify(result.stderr))
      }
    }
    return {
      path,
      ...recoveredOid.length > 0 ? { recoveredOid } : {},
    }
  }

  async commit(request: GitCommitRequest, signal?: AbortSignal): Promise<GitCommit> {
    const { root, message } = request
    if (message.trim().length === 0) {
      throw new GitError('a commit message is required', 'GIT_INVALID_REQUEST')
    }
    // `-m` takes the message as one argv element, so newlines, quotes, and
    // backticks in it are never interpreted.
    const result = await this.cli(root, ['commit', '-m', message], this.limits.writeTimeoutMs, signal)
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim()
      if (/nothing to commit|no changes added/i.test(detail)) {
        throw new GitError('nothing staged to commit', 'GIT_NOTHING_STAGED')
      }
      throw new GitError(`git commit failed: ${detail}`, classify(detail))
    }
    const [created] = await this.log({ root, limit: 1 }, signal)
    if (created === undefined) {
      throw new GitError('commit succeeded but no commit could be read back', 'GIT_FAILED')
    }
    return created
  }
}

/**
 * Classify a CLI failure message into the seam's error taxonomy. The CLI has
 * one exit code for nearly every failure, so its message is the only signal
 * that separates a missing repository from a conflict from an ordinary fault.
 */
function classify(detail: string): string {
  if (/not a git repository/i.test(detail)) return 'GIT_NOT_A_REPOSITORY'
  if (/conflict|unmerged/i.test(detail)) return 'GIT_CONFLICTED'
  if (/did not match any file|pathspec/i.test(detail)) return 'GIT_NOT_FOUND'
  return 'GIT_FAILED'
}

/**
 * Whether text read out of Git carries a NUL byte. Git itself decides binary
 * by the same test, and a browser cannot render such content as text.
 */
function isBinary(text: string): boolean {
  return text.includes('\0')
}
