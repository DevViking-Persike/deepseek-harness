/**
 * git domain contract: repository discovery, working-tree status, diffs,
 * history, and the mutations an operator applies to their own working tree,
 * over the host's `ctx.git` capability seam.
 *
 * Every operation is fenced twice. The repository must lie inside a registered
 * workspace, so a wire value can never address an arbitrary repository on the
 * machine, and every path must resolve inside that repository.
 *
 * Which mutations live here is a deliberate line. Staging, unstaging,
 * discarding, and committing are gestures an operator makes on the working
 * tree they are looking at — the same standing as `editor.writeFile`, which
 * also writes without an agent turn. Operations that rewrite shared history or
 * reach a remote (revert, reset, push) stay out: those go through the agent's
 * tools, where the session log records them.
 *
 * A discard preserves the content it replaces and returns its object id, so
 * the one operation here that can destroy uncommitted work leaves that work
 * recoverable.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One repository discovered beneath a workspace. */
export interface GitRepositoryEntry {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Directory name of the root, for display. */
  readonly name: string
  /** Absolute path of the workspace this repository was found under. */
  readonly workspacePath: string
  /** Workspace display title, so a picker can group without a second lookup. */
  readonly workspaceTitle: string
  /** True when this repository sits inside another discovered repository. */
  readonly submodule: boolean
}

/**
 * How one path changed on one side of the index. Mirrors the seam's closed
 * union; `unmodified` is the absent half of a one-sided change.
 */
export type GitChangeKindView
  = | 'unmodified'
    | 'added'
    | 'modified'
    | 'deleted'
    | 'renamed'
    | 'copied'
    | 'typechange'
    | 'untracked'
    | 'ignored'
    | 'conflicted'

/** One changed path, carrying both sides of the index independently. */
export interface GitFileChangeView {
  /** Repository-relative path, in Git's forward-slash spelling. */
  readonly path: string
  /** Absolute host path — the client never joins path segments itself. */
  readonly absolutePath: string
  /** Staged side: how the index differs from HEAD. */
  readonly index: GitChangeKindView
  /** Unstaged side: how the working tree differs from the index. */
  readonly worktree: GitChangeKindView
  /** Source path of a rename or copy; absent otherwise. */
  readonly origPath?: string
  /** Rename/copy similarity percentage (0-100). */
  readonly similarity?: number
  /** True when Git reports the content as binary, so no line counts exist. */
  readonly binary: boolean
  /** Lines added; absent for binary and untracked paths. */
  readonly insertions?: number
  /** Lines removed; absent for binary and untracked paths. */
  readonly deletions?: number
}

/** One repository's working-tree state. */
export interface GitStatusView {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Current branch; absent on a detached HEAD. */
  readonly branch?: string
  /** HEAD commit id; absent in a repository with no commits yet. */
  readonly head?: string
  /** Configured upstream ref; absent without a tracking branch. */
  readonly upstream?: string
  /** Commits this branch leads its upstream by; 0 without an upstream. */
  readonly ahead: number
  /** Commits this branch trails its upstream by; 0 without an upstream. */
  readonly behind: number
  /** Every changed path. */
  readonly changes: readonly GitFileChangeView[]
  /** True when the host cut `changes` at its bound. */
  readonly truncated: boolean
}

/** One file's before and after content. */
export interface GitDiffView {
  /** Repository-relative path the diff describes. */
  readonly path: string
  /** Content before the change; null when the file is being added. */
  readonly oldText: string | null
  /** Content after the change; null when the file is being deleted. */
  readonly newText: string | null
  /** True when either side is binary, in which case both texts are null. */
  readonly binary: boolean
}

/** One commit row of a history read. */
export interface GitCommitView {
  /** Full commit id. */
  readonly id: string
  /** Commit subject (the first line of the message). */
  readonly subject: string
  /** Author display name. */
  readonly authorName: string
  /** Author email address. */
  readonly authorEmail: string
  /** Authoring timestamp as an ISO-8601 string. */
  readonly authoredAt: string
  /** Parent commit ids; empty for a root commit, several for a merge. */
  readonly parents: readonly string[]
}

/**
 * One checkout of a repository. A repository always has its main working tree,
 * and `git worktree add` creates more — each with its own directory, HEAD, and
 * index over one shared object database.
 *
 * `changes` is what lets one call answer "what is in each worktree" instead of
 * a request per row. It is absent when that checkout could not be read (a
 * prunable one whose directory is gone), which the client shows as a state
 * rather than a failure.
 */
export interface GitWorktreeView {
  /** Absolute path of this checkout's directory. */
  readonly path: string
  /** Directory name of the path, for display. */
  readonly name: string
  /** Branch checked out here, short form; absent when detached or bare. */
  readonly branch?: string
  /** Commit this checkout points at; absent for a bare repository. */
  readonly head?: string
  /** True for the repository's main working tree. */
  readonly main: boolean
  /** True when HEAD points at a commit rather than a branch. */
  readonly detached: boolean
  /** True for a bare repository, which has no working tree. */
  readonly bare: boolean
  /** Lock reason; an empty string means locked without a stated one. */
  readonly locked?: string
  /** Why Git considers this checkout prunable — normally its directory is gone. */
  readonly prunable?: string
  /** Number of changed paths in this checkout; absent when it could not be read. */
  readonly changes?: number
}

/**
 * How the current branch stands against one integration branch — the question
 * asked before pushing: did `main` or `develop` move underneath this work, and
 * would merging it back conflict?
 */
export interface GitBaseComparisonView {
  /** Branch compared against, short form. */
  readonly base: string
  /** True when the base ref exists in this repository. */
  readonly exists: boolean
  /** Commits this branch has that the base does not. */
  readonly ahead: number
  /** Commits the base has that this branch does not — the "rebase first" signal. */
  readonly behind: number
  /** Whether merging back would conflict; absent when it could not be computed. */
  readonly conflicts?: boolean
}

/** One commit as the graph draws it. */
export interface GitGraphCommitView {
  /** Full commit id. */
  readonly id: string
  /** Parent ids in Git's order; two or more mark a merge. */
  readonly parents: readonly string[]
  /** Branch and tag names pointing here, short form. */
  readonly refs: readonly string[]
  /** Commit subject. */
  readonly subject: string
  /** Author display name. */
  readonly authorName: string
  /** Authoring timestamp as an ISO-8601 string. */
  readonly authoredAt: string
}

/** One branch anchoring the graph. */
export interface GitBranchView {
  /** Branch name, short form. */
  readonly name: string
  /** Commit the branch points at. */
  readonly head: string
  /** Configured upstream ref, short form; absent without tracking. */
  readonly upstream?: string
  /** True for the branch currently checked out. */
  readonly current: boolean
}

/** Which side of the index an operation addresses. */
export type GitDiffSideView = 'worktree' | 'index'

/** Git-domain unary methods (the map keys git.* of RpcMethodMap). */
export interface GitApi {
  /**
   * List repositories inside the registered workspaces. Fails with
   * `git-unavailable` when the composition mounts no Git seam, which the
   * client shows as an empty state rather than an error.
   */
  listRepositories(
    request: RpcRequest<{}>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ repositories: readonly GitRepositoryEntry[]; truncated: boolean }>>

  /**
   * Read one repository's working-tree status. Fails with `git-denied` for a
   * repository outside every registered workspace.
   */
  status(
    request: RpcRequest<{ root: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<GitStatusView>>

  /**
   * List every checkout of one repository, main working tree first, each with
   * its changed-path count so one call answers what is in each. Same
   * `git-denied` stance as `status` for a repository outside every workspace.
   */
  worktrees(
    request: RpcRequest<{ root: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ worktrees: readonly GitWorktreeView[] }>>

  /**
   * Compare one checkout against the deployment's integration branches, so a
   * client can warn before a push that the base moved or the merge would
   * conflict. Reads only: no ref moves and no file is written.
   */
  compareBases(
    request: RpcRequest<{ root: string; bases?: readonly string[] }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ comparisons: readonly GitBaseComparisonView[] }>>

  /**
   * Read the commit graph and the branches anchoring it, for a lane-and-node
   * rendering of the repository's history.
   */
  graph(
    request: RpcRequest<{ root: string; limit?: number }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{
    commits: readonly GitGraphCommitView[]
    branches: readonly GitBranchView[]
    truncated: boolean
  }>>

  /** Read one file's before and after content for the requested side. */
  diff(
    request: RpcRequest<{ root: string; path: string; side: GitDiffSideView }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<GitDiffView>>

  /** Read a repository's commit history, newest first. */
  log(
    request: RpcRequest<{ root: string; limit?: number; path?: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ commits: readonly GitCommitView[] }>>

  /** Add paths to the index, answering the settled status. */
  stage(
    request: RpcRequest<{ root: string; paths: readonly string[] }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<GitStatusView>>

  /** Remove paths from the index, leaving the working tree untouched. */
  unstage(
    request: RpcRequest<{ root: string; paths: readonly string[] }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<GitStatusView>>

  /**
   * Restore one path, preserving the replaced content first. `recoveredOid`
   * names that preserved content, so the discard can be undone through
   * `recover`; a client that drops it makes the work unreachable.
   */
  discard(
    request: RpcRequest<{ root: string; path: string; side: GitDiffSideView }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ status: GitStatusView; recoveredOid?: string }>>

  /**
   * Read content preserved by an earlier discard, so an accidental discard is
   * recoverable rather than lost.
   */
  recover(
    request: RpcRequest<{ root: string; oid: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ content: string }>>

  /**
   * Commit the staged changes. Fails with `git-nothing-staged` when the index
   * holds nothing, which the client shows as a disabled action rather than an
   * error.
   */
  commit(
    request: RpcRequest<{ root: string; message: string }>,
    signal: AbortSignal,
  ): Promise<RpcResponse<{ commit: GitCommitView; status: GitStatusView }>>
}
