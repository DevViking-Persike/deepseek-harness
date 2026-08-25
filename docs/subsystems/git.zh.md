# Git 访问

[English](git.md) | 中文

Git 访问 seam —— 一个[能力 seam](../../.agents/notes/implemented/architecture/2026-08-23-git-capability-seam-and-editor-panel.md)，在同一个 `ctx.git` 服务上涵盖仓库发现、工作区状态、diff、历史、工作树、基线比较以及索引/工作区改动，并跨包拆分：Service Definition（[dsh-git](../../packages/git/git)，`ctx.git` 与提供方注册表）、Service Provider（[dsh-git-local](../../packages/git/git-local)，经 `ctx.subprocess` 驱动的本机 `git` CLI）、Consumer（[dsh-tool-git](../../packages/git/tool-git)，`git_status` / `git_diff` / `git_log` 读取以及可选启用的改动组）。Git 是**一项可选能力**，不属于 agent-loop 主干，因此其词汇位于此处而非 [core.md](core.md)。

来源：[`packages/git/git/src/types.ts`](../../packages/git/git/src/types.ts)

## 为什么这些操作是同一项能力

发现、状态、diff、历史、工作树与改动都通过同一个后端解析同一个仓库，并在该后端不可用时以相同方式失败，因此它们共享同一个提供方选择策略的归属者、同一套中止/错误词汇，以及同一个"本 harness 如何访问 Git"的配置 API。它们的请求与结果类型保持分离。提供方注册的是**后端**（一个 `GitProvider`）而非工具；面向模型的名称、schema、提示词指引与呈现都位于唯一的 `dsh-tool-git` 消费方。

可用性按调用重新探测而非缓存：仓库会在一次普通会话中被初始化、克隆或删除，因此缓存的答案会把操作送往一个已经不适用的后端。

## 改动

`GitChangeKind` 是一个**封闭**联合：消费方对其做穷尽 `switch`，而报告集合之外状态的后端会将其映射到最接近的成员，而不是拓宽该联合。

`GitFileChange` **分别**携带 `index` 与 `worktree`，因为 Git 的两字母状态确实是两个事实：一个文件可以被暂存为新增，然后又被再次修改。把它们合并，正是让 UI 无法在同一行上同时提供暂存与取消暂存的原因。

```ts type-equiv
/**
 * How one path changed on one side of the index, normalized across backends.
 * `unmodified` is the absent half of a one-sided change (a staged-only edit
 * reports `unmodified` on the worktree side), so consumers switch over a
 * closed union instead of testing for undefined. A backend that reports a
 * state outside this set maps it to the closest member rather than widening it.
 */
type GitChangeKind
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
```

```ts type-equiv
/**
 * One path's change, carrying both sides of the index independently. Git's
 * two-letter status is genuinely two facts — a file can be staged as added and
 * then modified again in the worktree — and collapsing them into one word is
 * what makes a UI unable to offer stage and unstage on the same row.
 */
interface GitFileChange {
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
```

```ts type-equiv
/**
 * One repository's working-tree state. `branch` is absent on a detached HEAD
 * and `upstream` is absent without a tracking branch — both ordinary states a
 * UI renders differently, never errors.
 */
interface GitStatus {
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
```

## 发现

一个工作区不止一个仓库：monorepo 带着子模块，人也会把多个项目并排放着。嵌套被保留而非剪除，内层仓库会被标记。

```ts type-equiv
/** One discovered repository beneath a searched root. */
interface GitRepository {
  /** Absolute path of the working-tree root. */
  readonly root: string
  /** Directory name of {@link GitRepository.root}, for display. */
  readonly name: string
  /** Absolute path of the workspace this repository was discovered under. */
  readonly workspacePath: string
  /** True when this repository is a submodule of another discovered repository. */
  readonly submodule: boolean
}
```

```ts type-equiv
/** What one repository discovery scan is asked for. */
interface GitDiscoverRequest {
  /** Absolute directory roots to search beneath. */
  readonly roots: readonly string[]
  /** Directory levels to descend below each root. */
  readonly maxDepth: number
  /** Largest number of repositories to return before reporting truncation. */
  readonly limit: number
}
```

```ts type-equiv
/** Outcome of one repository discovery scan. */
interface GitDiscoverResult {
  /** Repositories found, ordered by root path. */
  readonly repositories: readonly GitRepository[]
  /** True when the scan hit {@link GitDiscoverRequest.limit} and stopped early. */
  readonly truncated: boolean
}
```

## 工作树

一个仓库不止一个检出。这些状态正是消费方在提供操作之前必须区分的：锁定的工作树拒绝移除，可修剪的工作树其目录已经丢失，而裸仓库根本没有工作区。

```ts type-equiv
/**
 * One checkout of a repository. A repository always has at least one — its
 * main working tree — and `git worktree add` creates more, each with its own
 * directory, its own HEAD, and its own index, all sharing one object database.
 *
 * The states are what a UI must separate before it offers an action: a locked
 * worktree refuses removal, a prunable one has already lost its directory, and
 * a bare repository has no working tree to show at all.
 */
interface GitWorktree {
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
```

## 集成分支

`behind > 0` 是决定推送是否安全的事实。`conflicts` 在对象数据库中计算，因此在推送前询问不写入任何内容，也不移动任何 ref。

```ts type-equiv
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
interface GitBaseComparison {
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
```

```ts type-equiv
/** What one integration-readiness check is asked for. */
interface GitBaseRequest {
  /** Absolute path of the checkout to compare. */
  readonly root: string
  /**
   * Branch names to compare against, in preference order. The provider reports
   * one entry per name that resolves, so a deployment naming both `main` and
   * `develop` learns about whichever it actually has.
   */
  readonly bases: readonly string[]
}
```

## 提交图谱

父提交正是图谱泳道的来源：第一个父提交延续一条线束，而合并的每个后续父提交各开一条。

```ts type-equiv
/** One commit as the graph draws it, with the parents that shape its lanes. */
interface GitGraphCommit {
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
```

```ts type-equiv
/** One branch of a repository, as the graph draws it. */
interface GitBranch {
  /** Branch name, short form. */
  readonly name: string
  /** Commit the branch points at. */
  readonly head: string
  /** Configured upstream ref, short form; absent without tracking. */
  readonly upstream?: string
  /** True for the branch currently checked out. */
  readonly current: boolean
}
```

```ts type-equiv
/** What one graph read is asked for. */
interface GitGraphRequest {
  /** Absolute path of the checkout to read. */
  readonly root: string
  /** Largest number of commits to return. */
  readonly limit: number
}
```

```ts type-equiv
/** The commit graph plus the branches whose tips anchor it. */
interface GitGraph {
  /** Commits in date order, newest first — the order the lanes are laid out in. */
  readonly commits: readonly GitGraphCommit[]
  /** Every local branch, so a renderer can label lanes without a second call. */
  readonly branches: readonly GitBranch[]
  /** True when the read hit {@link GitGraphRequest.limit} and stopped early. */
  readonly truncated: boolean
}
```

## Diff 与历史

`GitDiff` 携带整文件内容而非统一 patch：浏览器完整绘制两侧，而暂存某个 hunk 的消费方需要精确的字节。

```ts type-equiv
/**
 * Which side of the index a diff or a stage operation addresses. Git's own
 * split: `worktree` compares the working tree to the index, `index` compares
 * the index to HEAD.
 */
type GitDiffSide = 'worktree' | 'index'
```

```ts type-equiv
/** What one diff read is asked for. */
interface GitDiffRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Repository-relative path to diff. */
  readonly path: string
  /** Which side of the index to compare. */
  readonly side: GitDiffSide
}
```

```ts type-equiv
/**
 * One file's before and after text. Whole-file contents rather than a unified
 * patch: the browser renders both sides in full, and a consumer that stages a
 * hunk needs the exact bytes to write back, which a patch would force it to
 * reconstruct.
 */
interface GitDiff {
  /** Repository-relative path the diff describes. */
  readonly path: string
  /** Content before the change; null when the file is being added. */
  readonly oldText: string | null
  /** Content after the change; null when the file is being deleted. */
  readonly newText: string | null
  /** True when either side is binary, in which case both texts are null. */
  readonly binary: boolean
}
```

```ts type-equiv
/** One commit as the seam describes it. */
interface GitCommit {
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
```

```ts type-equiv
/** What one history read is asked for. */
interface GitLogRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Largest number of commits to return. */
  readonly limit: number
  /** Restrict history to commits touching this repository-relative path. */
  readonly path?: string
}
```

## 改动操作

丢弃是此处唯一可能丢失未提交工作的操作，因此本 seam 要求提供方保留它们所替换的内容。

```ts type-equiv
/** Which paths one index mutation addresses. */
interface GitStageRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Repository-relative paths to stage or unstage. */
  readonly paths: readonly string[]
}
```

```ts type-equiv
/**
 * A working-tree discard. Discarding destroys uncommitted work, so the seam
 * requires the caller to have read the file's current content: `expectedOid`
 * is the blob id the caller saw, and a backend refuses the discard when the
 * file moved on since then. This is the same freshness guard the editor's
 * `writeFile` applies, for the same reason — the agent edits the same files.
 */
interface GitDiscardRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Repository-relative path to restore from the index or HEAD. */
  readonly path: string
  /** Which side to discard: worktree edits, or the staged change itself. */
  readonly side: GitDiffSide
}
```

```ts type-equiv
/**
 * What a discard preserved so it can be undone. A discard writes the prior
 * content into the repository's object database before restoring the path, so
 * the work is addressable afterwards rather than destroyed.
 */
interface GitDiscardResult {
  /** Repository-relative path that was restored. */
  readonly path: string
  /**
   * Object id of the content the discard replaced, readable through
   * {@link GitProvider.readBlob}. Absent when the path had no prior content
   * (a discarded untracked file the backend removed outright).
   */
  readonly recoveredOid?: string
}
```

```ts type-equiv
/** What one commit creation is asked for. */
interface GitCommitRequest {
  /** Absolute path of the repository's working-tree root. */
  readonly root: string
  /** Commit message; the first line becomes the subject. */
  readonly message: string
}
```

## 提供方

提供方注册的是后端，绝非工具。`available()` 报告它此刻能否服务请求，seam 在选择期间调用它，从而跳过不可用的后端，而不是选中后再失败。

```ts type-equiv
/**
 * One Git backend. `available()` reports whether the backend can serve
 * requests right now; the seam calls it during selection, so a machine without
 * a usable `git` is skipped rather than chosen and failed.
 */
interface GitProvider {
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
```

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxgit--gitruntime"></a>

### `ctx.git` — `GitRuntime`

The Git access service, registered as `ctx.git` (one instance per context).

Selection semantics, resolved at execution time and never order-dependent:

- A configured id that is registered and `available()` → that provider.
- A configured id not registered → `GIT_PROVIDER_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `GIT_PROVIDER_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable provider → that provider.
- No id configured, several usable providers → `GIT_PROVIDER_AMBIGUOUS`.
- No id configured, no usable provider → `GIT_PROVIDER_UNAVAILABLE`.

Availability is re-probed on every call rather than cached: a repository is initialized, cloned, or deleted during an ordinary session, and a cached answer would route an operation to a backend that no longer applies.

```ts cordis-catalog
/**
 * Register one Git backend.
 * @param provider - the backend to add.
 * @returns a disposer that removes it; runs with the calling fiber.
 */
registerProvider(provider: GitProvider): () => void

/**
 * Ids of every registered backend, in registration order. Selection never
 * consults this order; it exists for diagnostics and provider display.
 * @returns the registered provider ids.
 */
providerIds(): readonly string[]

/**
 * Find repositories beneath the requested roots on the selected backend.
 * @param request - roots, depth bound, and result bound.
 * @param signal - cancellation for the scan.
 * @returns the discovered repositories and whether the scan was cut short.
 */
async discover(request: GitDiscoverRequest, signal?: AbortSignal): Promise<GitDiscoverResult>

/**
 * Read one repository's working-tree status on the selected backend.
 * @param root - absolute working-tree root.
 * @param signal - cancellation for the underlying call.
 * @returns the branch facts and every changed path.
 */
async status(root: string, signal?: AbortSignal): Promise<GitStatus>

/**
 * List every checkout of one repository on the selected backend.
 * @param root - absolute path of any checkout of the repository.
 * @param signal - cancellation for the underlying call.
 * @returns the repository's worktrees, main working tree first.
 */
async worktrees(root: string, signal?: AbortSignal): Promise<readonly GitWorktree[]>

/**
 * Compare one checkout against each named integration branch on the selected
 * backend — the "did main move under me" question asked before a push.
 * @param request - the checkout and the base names to compare against.
 * @param signal - cancellation for the underlying call.
 * @returns one comparison per requested base, in the order asked.
 */
async compareBases(request: GitBaseRequest, signal?: AbortSignal): Promise<readonly GitBaseComparison[]>

/**
 * Read the commit graph and its branches on the selected backend.
 * @param request - the checkout and the commit bound.
 * @param signal - cancellation for the underlying call.
 * @returns the commits, the branches, and whether the read was cut short.
 */
async graph(request: GitGraphRequest, signal?: AbortSignal): Promise<GitGraph>

/**
 * Read one file's before and after content on the selected backend.
 * @param request - repository, path, and index side.
 * @param signal - cancellation for the underlying call.
 * @returns both sides of the file's content.
 */
async diff(request: GitDiffRequest, signal?: AbortSignal): Promise<GitDiff>

/**
 * Read a repository's commit history on the selected backend.
 * @param request - repository, bound, and optional path filter.
 * @param signal - cancellation for the underlying call.
 * @returns the commits, newest first.
 */
async log(request: GitLogRequest, signal?: AbortSignal): Promise<readonly GitCommit[]>

/**
 * Read one object's content by id on the selected backend, so a discard can
 * be undone.
 * @param root - absolute working-tree root.
 * @param oid - object id, normally a `GitDiscardResult.recoveredOid`.
 * @param signal - cancellation for the underlying call.
 * @returns the object's text.
 */
async readBlob(root: string, oid: string, signal?: AbortSignal): Promise<string>

/**
 * Add paths to the index on the selected backend.
 * @param request - repository and paths.
 * @param signal - cancellation for the underlying call.
 */
async stage(request: GitStageRequest, signal?: AbortSignal): Promise<void>

/**
 * Remove paths from the index on the selected backend, leaving the working
 * tree untouched.
 * @param request - repository and paths.
 * @param signal - cancellation for the underlying call.
 */
async unstage(request: GitStageRequest, signal?: AbortSignal): Promise<void>

/**
 * Restore one path on the selected backend, preserving the replaced content
 * first so the discard can be undone.
 * @param request - repository, path, and which side to discard.
 * @param signal - cancellation for the underlying call.
 * @returns the path and the object id its prior content was preserved as.
 */
async discard(request: GitDiscardRequest, signal?: AbortSignal): Promise<GitDiscardResult>

/**
 * Commit the staged changes on the selected backend.
 * @param request - repository and message.
 * @param signal - cancellation for the underlying call.
 * @returns the created commit.
 */
async commit(request: GitCommitRequest, signal?: AbortSignal): Promise<GitCommit>
```

Source: [`packages/git/git/src/index.ts:94`](../../packages/git/git/src/index.ts)
<!-- END GENERATED cordis-surface -->
