/**
 * Vocabulary for the Git capability seam (`ctx.git`). Repository discovery,
 * working-tree status, diffs, history, and index/worktree mutation share one
 * seam because they share one repository resolution, one selection decision,
 * and one error taxonomy; their request and result types stay separate.
 * @module @deepseek-ai/dsh-git/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/**
 * How one path changed on one side of the index, normalized across backends.
 * `unmodified` is the absent half of a one-sided change (a staged-only edit
 * reports `unmodified` on the worktree side), so consumers switch over a
 * closed union instead of testing for undefined. A backend that reports a
 * state outside this set maps it to the closest member rather than widening it.
 */
export type GitChangeKind
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

/**
 * One path's change, carrying both sides of the index independently. Git's
 * two-letter status is genuinely two facts — a file can be staged as added and
 * then modified again in the worktree — and collapsing them into one word is
 * what makes a UI unable to offer stage and unstage on the same row.
 */
export interface GitFileChange {
  /** Repository-relative path, in Git's own forward-slash spelling. */
  readonly path: string
  /** Absolute host path, so a consumer never joins path segments itself. */
  readonly absolutePath: string
  /** Staged side: how the index differs from HEAD. */
  readonly index: GitChangeKind
  /** Unstaged side: how the working tree differs from the index. */
  readonly worktree: GitChangeKind
  /** Source path of a rename or copy; absent for every other kind. */
  readonly origPath?: string
  /** Rename/copy similarity percentage as Git scored it (0-100). */
  readonly similarity?: number
  /** True when Git reports the content as binary, so no line counts exist. */
  readonly binary: boolean
  /** Lines added, when the backend counted them; absent for binary and untracked paths. */
  readonly insertions?: number
  /** Lines removed, when the backend counted them; absent for binary and untracked paths. */
  readonly deletions?: number
}

/**
 * One repository's working-tree state. `branch` is absent on a detached HEAD
 * and `upstream` is absent without a tracking branch — both ordinary states a
 * UI renders differently, never errors.
 */
export interface GitStatus {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Current branch name; absent on a detached HEAD. */
  readonly branch?: string
  /** HEAD commit id; absent in a repository with no commits yet. */
  readonly head?: string
  /** Configured upstream ref (`origin/main`); absent without a tracking branch. */
  readonly upstream?: string
  /** Commits this branch leads its upstream by; 0 without an upstream. */
  readonly ahead: number
  /** Commits this branch trails its upstream by; 0 without an upstream. */
  readonly behind: number
  /** Every changed path, index and worktree sides folded per path. */
  readonly changes: readonly GitFileChange[]
  /** True when the backend cut `changes` at its complete-result bound. */
  readonly truncated: boolean
}

/** One discovered repository beneath a searched root. */
export interface GitRepository {
  /** Absolute path of the working-tree root. */
  readonly root: string
  /** Directory name of {@link GitRepository.root}, for display. */
  readonly name: string
  /** Absolute path of the workspace this repository was discovered under. */
  readonly workspacePath: string
  /** True when this repository is a submodule of another discovered repository. */
  readonly submodule: boolean
}

/**
 * One checkout of a repository. A repository always has at least one — its
 * main working tree — and `git worktree add` creates more, each with its own
 * directory, its own HEAD, and its own index, all sharing one object database.
 *
 * The states are what a UI must separate before it offers an action: a locked
 * worktree refuses removal, a prunable one has already lost its directory, and
 * a bare repository has no working tree to show at all.
 */
export interface GitWorktree {
  /** Absolute path of this checkout's directory. */
  readonly path: string
  /** Directory name of {@link GitWorktree.path}, for display. */
  readonly name: string
  /** Branch checked out here, without the `refs/heads/` prefix; absent when detached or bare. */
  readonly branch?: string
  /** Commit this checkout points at; absent for a bare repository. */
  readonly head?: string
  /** True for the repository's main working tree, as opposed to a linked one. */
  readonly main: boolean
  /** True when HEAD points at a commit rather than a branch. */
  readonly detached: boolean
  /** True for a bare repository, which has no working tree. */
  readonly bare: boolean
  /** Lock reason when this checkout is locked; an empty string means locked without one. */
  readonly locked?: string
  /** Why Git considers this checkout prunable — normally its directory is gone. */
  readonly prunable?: string
}

/** What one repository discovery scan is asked for. */
export interface GitDiscoverRequest {
  /** Absolute directory roots to search beneath. */
  readonly roots: readonly string[]
  /** Directory levels to descend below each root. */
  readonly maxDepth: number
  /** Largest number of repositories to return before reporting truncation. */
  readonly limit: number
}

/** Outcome of one repository discovery scan. */
export interface GitDiscoverResult {
  /** Repositories found, ordered by root path. */
  readonly repositories: readonly GitRepository[]
  /** True when the scan hit {@link GitDiscoverRequest.limit} and stopped early. */
  readonly truncated: boolean
}

/**
 * How the current branch stands against one integration branch — the question
 * asked before pushing: has `main` or `develop` moved underneath this work,
 * and would merging it back conflict?
 *
 * `behind > 0` means the base advanced since this branch left it, which is the
 * condition that breaks a push or forces a merge commit nobody reviewed.
 * `conflicts` is computed without touching the working tree, so asking costs
 * nothing and changes nothing.
 */
export interface GitBaseComparison {
  /** Branch compared against, short form (`main`, `develop`, `origin/main`). */
  readonly base: string
  /** True when the base ref exists; a repository without it reports nothing else. */
  readonly exists: boolean
  /** Commits this branch has that the base does not. */
  readonly ahead: number
  /** Commits the base has that this branch does not — the "must rebase first" signal. */
  readonly behind: number
  /**
   * Whether merging this branch into the base would conflict. Computed with
   * `merge-tree`, which writes no files and moves no refs. Absent when the
   * comparison could not be made (an unborn branch, a missing base).
   */
  readonly conflicts?: boolean
}

/** What one integration-readiness check is asked for. */
export interface GitBaseRequest {
  /** Absolute path of the checkout to compare. */
  readonly root: string
  /**
   * Branch names to compare against, in preference order. The provider reports
   * one entry per name that resolves, so a deployment naming both `main` and
   * `develop` learns about whichever it actually has.
   */
  readonly bases: readonly string[]
}

/** One branch of a repository, as the graph draws it. */
export interface GitBranch {
  /** Branch name, short form. */
  readonly name: string
  /** Commit the branch points at. */
  readonly head: string
  /** Configured upstream ref, short form; absent without tracking. */
  readonly upstream?: string
  /** True for the branch currently checked out. */
  readonly current: boolean
}

/** One commit as the graph draws it, with the parents that shape its lanes. */
export interface GitGraphCommit {
  /** Full commit id. */
  readonly id: string
  /** Parent ids in Git's own order; two or more mark a merge. */
  readonly parents: readonly string[]
  /** Branch and tag names pointing at this commit, short form. */
  readonly refs: readonly string[]
  /** Commit subject. */
  readonly subject: string
  /** Author display name. */
  readonly authorName: string
  /** Authoring timestamp as an ISO-8601 string. */
  readonly authoredAt: string
}

/** What one graph read is asked for. */
export interface GitGraphRequest {
  /** Absolute path of the checkout to read. */
  readonly root: string
  /** Largest number of commits to return. */
  readonly limit: number
}

/** The commit graph plus the branches whose tips anchor it. */
export interface GitGraph {
  /** Commits in date order, newest first — the order the lanes are laid out in. */
  readonly commits: readonly GitGraphCommit[]
  /** Every local branch, so a renderer can label lanes without a second call. */
  readonly branches: readonly GitBranch[]
  /** True when the read hit {@link GitGraphRequest.limit} and stopped early. */
  readonly truncated: boolean
}

/**
 * Which side of the index a diff or a stage operation addresses. Git's own
 * split: `worktree` compares the working tree to the index, `index` compares
 * the index to HEAD.
 */
export type GitDiffSide = 'worktree' | 'index'

/** What one diff read is asked for. */
export interface GitDiffRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Repository-relative path to diff. */
  readonly path: string
  /** Which side of the index to compare. */
  readonly side: GitDiffSide
}

/**
 * One file's before and after text. Whole-file contents rather than a unified
 * patch: the browser renders both sides in full, and a consumer that stages a
 * hunk needs the exact bytes to write back, which a patch would force it to
 * reconstruct.
 */
export interface GitDiff {
  /** Repository-relative path the diff describes. */
  readonly path: string
  /** Content before the change; null when the file is being added. */
  readonly oldText: string | null
  /** Content after the change; null when the file is being deleted. */
  readonly newText: string | null
  /** True when either side is binary, in which case both texts are null. */
  readonly binary: boolean
}

/** One commit as the seam describes it. */
export interface GitCommit {
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

/** What one history read is asked for. */
export interface GitLogRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Largest number of commits to return. */
  readonly limit: number
  /** Restrict history to commits touching this repository-relative path. */
  readonly path?: string
}

/** Which paths one index mutation addresses. */
export interface GitStageRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Repository-relative paths to stage or unstage. */
  readonly paths: readonly string[]
}

/**
 * A working-tree discard. Discarding destroys uncommitted work, so the seam
 * requires the caller to have read the file's current content: `expectedOid`
 * is the blob id the caller saw, and a backend refuses the discard when the
 * file moved on since then. This is the same freshness guard the editor's
 * `writeFile` applies, for the same reason — the agent edits the same files.
 */
export interface GitDiscardRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Repository-relative path to restore from the index or HEAD. */
  readonly path: string
  /** Which side to discard: worktree edits, or the staged change itself. */
  readonly side: GitDiffSide
}

/**
 * What a discard preserved so it can be undone. A discard writes the prior
 * content into the repository's object database before restoring the path, so
 * the work is addressable afterwards rather than destroyed.
 */
export interface GitDiscardResult {
  /** Repository-relative path that was restored. */
  readonly path: string
  /**
   * Object id of the content the discard replaced, readable through
   * {@link GitProvider.readBlob}. Absent when the path had no prior content
   * (a discarded untracked file the backend removed outright).
   */
  readonly recoveredOid?: string
}

/** What one commit creation is asked for. */
export interface GitCommitRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Commit message; the first line becomes the subject. */
  readonly message: string
}

/**
 * One Git backend. `available()` reports whether the backend can serve
 * requests right now; the seam calls it during selection, so a machine without
 * a usable `git` is skipped rather than chosen and failed.
 */
export interface GitProvider {
  /** Stable provider id, unique within the seam's registry. */
  readonly id: string
  /**
   * Whether this backend can serve requests right now.
   * @returns true when the backend answered.
   */
  available: () => Promise<boolean>
  /**
   * Find repositories beneath the requested roots.
   * @param request - roots, depth bound, and result bound.
   * @param signal - cancellation for the scan.
   * @returns the discovered repositories and whether the scan was cut short.
   */
  discover: (request: GitDiscoverRequest, signal?: AbortSignal) => Promise<GitDiscoverResult>
  /**
   * Read one repository's working-tree status.
   * @param root - absolute working-tree root.
   * @param signal - cancellation for the underlying call.
   * @returns the branch facts and every changed path.
   */
  status: (root: string, signal?: AbortSignal) => Promise<GitStatus>
  /**
   * List every checkout of one repository, main working tree first.
   * @param root - absolute path of any checkout of the repository.
   * @param signal - cancellation for the underlying call.
   * @returns the repository's worktrees.
   */
  worktrees: (root: string, signal?: AbortSignal) => Promise<readonly GitWorktree[]>
  /**
   * Compare one checkout against each named integration branch. Reads only:
   * no ref moves and no file is written, so asking before a push is free.
   * @param request - the checkout and the base names to compare against.
   * @param signal - cancellation for the underlying call.
   * @returns one comparison per requested base, in the order asked.
   */
  compareBases: (request: GitBaseRequest, signal?: AbortSignal) => Promise<readonly GitBaseComparison[]>
  /**
   * Read the commit graph and the branches anchoring it.
   * @param request - the checkout and the commit bound.
   * @param signal - cancellation for the underlying call.
   * @returns the commits, the branches, and whether the read was cut short.
   */
  graph: (request: GitGraphRequest, signal?: AbortSignal) => Promise<GitGraph>
  /**
   * Read one file's before and after content for the requested side.
   * @param request - repository, path, and index side.
   * @param signal - cancellation for the underlying call.
   * @returns both sides of the file's content.
   */
  diff: (request: GitDiffRequest, signal?: AbortSignal) => Promise<GitDiff>
  /**
   * Read a repository's commit history.
   * @param request - repository, bound, and optional path filter.
   * @param signal - cancellation for the underlying call.
   * @returns the commits, newest first.
   */
  log: (request: GitLogRequest, signal?: AbortSignal) => Promise<readonly GitCommit[]>
  /**
   * Read one object's content by id, so a discard can be undone.
   * @param root - absolute working-tree root.
   * @param oid - object id, normally a {@link GitDiscardResult.recoveredOid}.
   * @param signal - cancellation for the underlying call.
   * @returns the object's text.
   */
  readBlob: (root: string, oid: string, signal?: AbortSignal) => Promise<string>
  /**
   * Add paths to the index.
   * @param request - repository and paths.
   * @param signal - cancellation for the underlying call.
   */
  stage: (request: GitStageRequest, signal?: AbortSignal) => Promise<void>
  /**
   * Remove paths from the index, leaving the working tree untouched.
   * @param request - repository and paths.
   * @param signal - cancellation for the underlying call.
   */
  unstage: (request: GitStageRequest, signal?: AbortSignal) => Promise<void>
  /**
   * Restore one path, preserving the replaced content first.
   * @param request - repository, path, and which side to discard.
   * @param signal - cancellation for the underlying call.
   * @returns the path and the object id its prior content was preserved as.
   */
  discard: (request: GitDiscardRequest, signal?: AbortSignal) => Promise<GitDiscardResult>
  /**
   * Commit the staged changes.
   * @param request - repository and message.
   * @param signal - cancellation for the underlying call.
   * @returns the created commit.
   */
  commit: (request: GitCommitRequest, signal?: AbortSignal) => Promise<GitCommit>
}

/**
 * Typed Git error with a machine-routable, open-string `code` and chained
 * `cause`. Consumers must tolerate provider-specific codes. The seam itself
 * raises `GIT_PROVIDER_UNAVAILABLE`, `GIT_PROVIDER_AMBIGUOUS`,
 * `GIT_PROVIDER_CONFIGURED_MISSING`, `GIT_PROVIDER_CONFIGURED_UNAVAILABLE`,
 * and `GIT_PROVIDER_DUPLICATE`; providers add repository-level codes such as
 * `GIT_NOT_A_REPOSITORY`, `GIT_STALE`, `GIT_CONFLICTED`, and `GIT_FAILED`.
 * Tool execution exposes the code in structured error metadata.
 */
export class GitError extends HarnessError {}
