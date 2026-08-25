/**
 * Service Definition for the Git capability seam (`ctx.git`): a provider
 * registry and provider-selecting execution for repository discovery, status,
 * diffs, history, and index/worktree mutation. Duplicate ids are rejected. At
 * execution time a configured provider must exist and be usable; without one,
 * exactly one usable provider is required, so selection never depends on
 * registration order. The local CLI implementation lives in
 * `@deepseek-ai/dsh-git-local`.
 * @module @deepseek-ai/dsh-git
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
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
  GitLogRequest,
  GitProvider,
  GitStageRequest,
  GitStatus,
  GitWorktree,
} from './types.ts'
import { GitError } from './types.ts'

export { GitError } from './types.ts'
export type {
  GitChangeKind,
  GitBaseComparison,
  GitBaseRequest,
  GitBranch,
  GitGraph,
  GitGraphCommit,
  GitGraphRequest,
  GitCommit,
  GitCommitRequest,
  GitDiff,
  GitDiffRequest,
  GitDiffSide,
  GitDiscardRequest,
  GitDiscardResult,
  GitDiscoverRequest,
  GitDiscoverResult,
  GitFileChange,
  GitLogRequest,
  GitProvider,
  GitRepository,
  GitStageRequest,
  GitStatus,
  GitWorktree,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    git: GitRuntime
  }
}

/**
 * Config for the Git seam. `provider` pins which backend wins; it is optional
 * because a single registered usable provider auto-selects. Operational
 * overrides must feed this same field rather than introduce a hidden priority
 * chain.
 */
export interface GitRuntimeConfig {
  /** Explicit provider id. Omitted = auto-select when exactly one is usable. */
  readonly provider?: string
}

/**
 * The Git access service, registered as `ctx.git` (one instance per context).
 *
 * Selection semantics, resolved at execution time and never order-dependent:
 * - A configured id that is registered and `available()` → that provider.
 * - A configured id not registered → `GIT_PROVIDER_CONFIGURED_MISSING`.
 * - A configured id registered but unavailable → `GIT_PROVIDER_CONFIGURED_UNAVAILABLE`.
 * - No id configured, exactly one registered usable provider → that provider.
 * - No id configured, several usable providers → `GIT_PROVIDER_AMBIGUOUS`.
 * - No id configured, no usable provider → `GIT_PROVIDER_UNAVAILABLE`.
 *
 * Availability is re-probed on every call rather than cached: a repository is
 * initialized, cloned, or deleted during an ordinary session, and a cached
 * answer would route an operation to a backend that no longer applies.
 */
export class GitRuntime extends Service {
  /** Provider selection config; `$DSH_GIT_PROVIDER` feeds the same field. */
  static Config: z<GitRuntimeConfig> = z.object({
    provider: z.string(),
  })

  /** Registered backends by id; registration order carries no meaning. */
  private readonly providers = new Map<string, GitProvider>()

  /** Configured provider id, or the `$DSH_GIT_PROVIDER` operational override. */
  private readonly providerId: string | undefined

  constructor(ctx: Context, config: GitRuntimeConfig = {}) {
    super(ctx, 'git')
    this.providerId = config.provider ?? process.env.DSH_GIT_PROVIDER
  }

  /**
   * Register one Git backend.
   * @param provider - the backend to add.
   * @returns a disposer that removes it; runs with the calling fiber.
   */
  registerProvider(provider: GitProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new GitError(
        `git provider "${provider.id}" is already registered`,
        'GIT_PROVIDER_DUPLICATE',
      )
    }
    const providers = this.providers
    const dispose = this.ctx.effect(function* () {
      providers.set(provider.id, provider)
      yield () => providers.delete(provider.id)
    }, 'git.registerProvider()')
    // ctx.effect's disposer returns Promise<void>; this disposer API is
    // synchronous fire-and-forget — discard the (always-resolved) promise.
    return () => void dispose()
  }

  /**
   * Ids of every registered backend, in registration order. Selection never
   * consults this order; it exists for diagnostics and provider display.
   * @returns the registered provider ids.
   */
  providerIds(): readonly string[] {
    return [...this.providers.keys()]
  }

  /**
   * Resolve the backend one operation must run on. Availability is probed
   * here, so a machine whose `git` disappeared between calls fails selection
   * rather than the operation.
   * @returns the selected backend.
   */
  private async select(): Promise<GitProvider> {
    const configuredId = this.providerId
    if (configuredId !== undefined && configuredId.length > 0) {
      const configured = this.providers.get(configuredId)
      if (configured === undefined) {
        throw new GitError(
          `configured git provider "${configuredId}" is not registered`,
          'GIT_PROVIDER_CONFIGURED_MISSING',
        )
      }
      if (!await configured.available()) {
        throw new GitError(
          `configured git provider "${configuredId}" is unusable`,
          'GIT_PROVIDER_CONFIGURED_UNAVAILABLE',
        )
      }
      return configured
    }
    const usable: GitProvider[] = []
    for (const provider of this.providers.values()) {
      if (await provider.available()) usable.push(provider)
    }
    const [only] = usable
    if (only === undefined) {
      throw new GitError(
        'no usable git provider is registered',
        'GIT_PROVIDER_UNAVAILABLE',
      )
    }
    if (usable.length > 1) {
      throw new GitError(
        `several usable git providers (${usable.map(p => p.id).join(', ')}); set the seam's provider`,
        'GIT_PROVIDER_AMBIGUOUS',
      )
    }
    return only
  }

  /**
   * Find repositories beneath the requested roots on the selected backend.
   * @param request - roots, depth bound, and result bound.
   * @param signal - cancellation for the scan.
   * @returns the discovered repositories and whether the scan was cut short.
   */
  async discover(request: GitDiscoverRequest, signal?: AbortSignal): Promise<GitDiscoverResult> {
    const provider = await this.select()
    return provider.discover(request, signal)
  }

  /**
   * Read one repository's working-tree status on the selected backend.
   * @param root - absolute working-tree root.
   * @param signal - cancellation for the underlying call.
   * @returns the branch facts and every changed path.
   */
  async status(root: string, signal?: AbortSignal): Promise<GitStatus> {
    const provider = await this.select()
    return provider.status(root, signal)
  }

  /**
   * List every checkout of one repository on the selected backend.
   * @param root - absolute path of any checkout of the repository.
   * @param signal - cancellation for the underlying call.
   * @returns the repository's worktrees, main working tree first.
   */
  async worktrees(root: string, signal?: AbortSignal): Promise<readonly GitWorktree[]> {
    const provider = await this.select()
    return provider.worktrees(root, signal)
  }

  /**
   * Compare one checkout against each named integration branch on the selected
   * backend — the "did main move under me" question asked before a push.
   * @param request - the checkout and the base names to compare against.
   * @param signal - cancellation for the underlying call.
   * @returns one comparison per requested base, in the order asked.
   */
  async compareBases(request: GitBaseRequest, signal?: AbortSignal): Promise<readonly GitBaseComparison[]> {
    const provider = await this.select()
    return provider.compareBases(request, signal)
  }

  /**
   * Read the commit graph and its branches on the selected backend.
   * @param request - the checkout and the commit bound.
   * @param signal - cancellation for the underlying call.
   * @returns the commits, the branches, and whether the read was cut short.
   */
  async graph(request: GitGraphRequest, signal?: AbortSignal): Promise<GitGraph> {
    const provider = await this.select()
    return provider.graph(request, signal)
  }

  /**
   * Read one file's before and after content on the selected backend.
   * @param request - repository, path, and index side.
   * @param signal - cancellation for the underlying call.
   * @returns both sides of the file's content.
   */
  async diff(request: GitDiffRequest, signal?: AbortSignal): Promise<GitDiff> {
    const provider = await this.select()
    return provider.diff(request, signal)
  }

  /**
   * Read a repository's commit history on the selected backend.
   * @param request - repository, bound, and optional path filter.
   * @param signal - cancellation for the underlying call.
   * @returns the commits, newest first.
   */
  async log(request: GitLogRequest, signal?: AbortSignal): Promise<readonly GitCommit[]> {
    const provider = await this.select()
    return provider.log(request, signal)
  }

  /**
   * Read one object's content by id on the selected backend, so a discard can
   * be undone.
   * @param root - absolute working-tree root.
   * @param oid - object id, normally a `GitDiscardResult.recoveredOid`.
   * @param signal - cancellation for the underlying call.
   * @returns the object's text.
   */
  async readBlob(root: string, oid: string, signal?: AbortSignal): Promise<string> {
    const provider = await this.select()
    return provider.readBlob(root, oid, signal)
  }

  /**
   * Add paths to the index on the selected backend.
   * @param request - repository and paths.
   * @param signal - cancellation for the underlying call.
   */
  async stage(request: GitStageRequest, signal?: AbortSignal): Promise<void> {
    const provider = await this.select()
    return provider.stage(request, signal)
  }

  /**
   * Remove paths from the index on the selected backend, leaving the working
   * tree untouched.
   * @param request - repository and paths.
   * @param signal - cancellation for the underlying call.
   */
  async unstage(request: GitStageRequest, signal?: AbortSignal): Promise<void> {
    const provider = await this.select()
    return provider.unstage(request, signal)
  }

  /**
   * Restore one path on the selected backend, preserving the replaced content
   * first so the discard can be undone.
   * @param request - repository, path, and which side to discard.
   * @param signal - cancellation for the underlying call.
   * @returns the path and the object id its prior content was preserved as.
   */
  async discard(request: GitDiscardRequest, signal?: AbortSignal): Promise<GitDiscardResult> {
    const provider = await this.select()
    return provider.discard(request, signal)
  }

  /**
   * Commit the staged changes on the selected backend.
   * @param request - repository and message.
   * @param signal - cancellation for the underlying call.
   * @returns the created commit.
   */
  async commit(request: GitCommitRequest, signal?: AbortSignal): Promise<GitCommit> {
    const provider = await this.select()
    return provider.commit(request, signal)
  }
}

export default GitRuntime
