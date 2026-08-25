/**
 * Vocabulary types, error definitions, and interface contracts for the repository capability seam (`ctx.repositories`).
 * @module @deepseek-ai/dsh-repository/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { CatalogProviderId, ForgeId, RepositoryId } from './brand.ts'

export type { CatalogProviderId, ForgeId, RepositoryId } from './brand.ts'

/**
 * Structured repository capability failure. Extends {@link HarnessError} with a stable error code.
 */
export class RepositoryError extends HarnessError {}

/**
 * Represents a configured remote on a managed git repository.
 */
export interface RepositoryRemote {
  /** Remote name (e.g. 'origin', 'upstream'). */
  readonly name: string
  /** Remote fetch/push URL. */
  readonly url: string
  /** Explicit fetch URL when distinct from url. */
  readonly fetchUrl?: string | undefined
  /** Explicit push URL when distinct from url. */
  readonly pushUrl?: string | undefined
}

/**
 * Linkage between a repository and an upstream forge.
 */
export interface RepositoryForgeRef {
  /** Forge provider identifier. */
  readonly forgeId: ForgeId
  /** Repository owner/organization on the forge. */
  readonly owner: string
  /** Repository name on the forge. */
  readonly name: string
}

/**
 * Represents a repository known to the catalog.
 */
export interface Repository {
  /** Opaque repository identifier. */
  readonly id: RepositoryId
  /** Display name of the repository. */
  readonly name: string
  /** Canonical root path on the local filesystem. */
  readonly path: string
  /** Git remotes configured for this repository. */
  readonly remotes?: readonly RepositoryRemote[] | undefined
  /** Default branch name (e.g. 'main', 'master'). */
  readonly defaultBranch?: string | undefined
  /** Currently checked-out branch name. */
  readonly currentBranch?: string | undefined
  /** Whether the working tree has no uncommitted changes. */
  readonly isClean?: boolean | undefined
  /** Forge linkage metadata if connected to a recognized forge. */
  readonly forge?: RepositoryForgeRef | undefined
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string
  /** ISO-8601 last update timestamp. */
  readonly updatedAt: string
  /** Additional provider-specific metadata. */
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

/**
 * Declared capabilities of a code forge provider.
 */
export interface ForgeCapabilities {
  /** Whether the forge supports pull request / merge request operations. */
  readonly pullRequests: boolean
  /** Whether the forge supports issue tracking. */
  readonly issues: boolean
  /** Whether the forge supports fork creation and management. */
  readonly forks: boolean
  /** Whether the forge supports remote branch listing and manipulation. */
  readonly branches: boolean
  /** Whether the forge supports code search API. */
  readonly codeSearch: boolean
  /** Whether the forge supports webhook management. */
  readonly webhooks: boolean
}

/**
 * Status state of a forge connection.
 */
export type ForgeState = 'unconfigured' | 'configured' | 'ready' | 'error'

/**
 * Status information for a code forge provider.
 */
export interface ForgeStatus {
  /** High-level readiness state of the forge. */
  readonly state: ForgeState
  /** Whether active credentials / authentication exist. */
  readonly authenticated: boolean
  /** Authenticated username or account handle, if available. */
  readonly username?: string | undefined
  /** Human-readable status description or error details. */
  readonly detail?: string | undefined
}

/**
 * Code forge provider interface registered into `ctx.repositories`.
 */
export interface ForgeProvider {
  /** Stable identifier for the forge provider. */
  readonly id: ForgeId
  /** Human-readable display name (e.g. 'GitHub', 'GitLab'). */
  readonly displayName: string
  /** Primary web domain of the forge service (e.g. 'github.com', 'gitlab.com'). */
  readonly domain: string
  /**
   * Retrieve supported capabilities for this forge provider.
   * @returns the capability flags.
   */
  capabilities(): ForgeCapabilities | Promise<ForgeCapabilities>
  /**
   * Check connection and authentication status for this forge.
   * @param signal - optional cancellation signal.
   * @returns status snapshot.
   */
  status(signal?: AbortSignal): Promise<ForgeStatus>
}

/**
 * Filter parameters for querying repositories in the catalog.
 */
export interface RepositoryFilter {
  /** Filter repositories whose filesystem path starts with this prefix. */
  readonly pathPrefix?: string | undefined
  /** Filter repositories whose name contains this substring (case-insensitive). */
  readonly nameQuery?: string | undefined
  /** Filter repositories linked to this specific forge. */
  readonly forgeId?: ForgeId | undefined
}

/**
 * Request payload for adding an existing local repository to the catalog.
 */
export interface RepositoryAddRequest {
  /** Local filesystem path to the repository root. */
  readonly path: string
  /** Optional custom display name; defaults to directory name if omitted. */
  readonly name?: string | undefined
  /** Optional configured git remotes. */
  readonly remotes?: readonly RepositoryRemote[] | undefined
  /** Optional metadata properties. */
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

/**
 * Request payload for discovering repositories on the filesystem.
 */
export interface RepositoryScanRequest {
  /** Root directory paths to scan. */
  readonly roots: readonly string[]
  /** Maximum traversal depth for discovery. */
  readonly maxDepth?: number | undefined
  /** Maximum number of repositories to discover. */
  readonly limit?: number | undefined
}

/**
 * Result of a repository scan operation.
 */
export interface RepositoryScanResult {
  /** Newly discovered and registered repositories. */
  readonly added: readonly Repository[]
  /** Repositories that were already present in the catalog. */
  readonly existing: readonly Repository[]
  /** Scan errors encountered on specific directory paths. */
  readonly errors?: readonly { readonly path: string; readonly error: string }[] | undefined
}

/**
 * Event payload emitted when a catalog repository changes.
 */
export interface RepositoryChangeEvent {
  /** Kind of mutation applied to the repository. */
  readonly kind: 'added' | 'removed' | 'updated'
  /** The affected repository snapshot. */
  readonly repository: Repository
}

/**
 * Listener callback for repository catalog mutations.
 */
export type RepositoriesChangedListener = (event: RepositoryChangeEvent) => void

/**
 * Provider interface for local catalog persistence and management operations.
 */
export interface RepositoryCatalogProvider {
  /** Unique provider identifier. */
  readonly id: CatalogProviderId
  /**
   * Check whether the catalog provider backend is available.
   * @returns true if available and ready.
   */
  available(): Promise<boolean>
  /**
   * List repositories matching the given filter.
   * @param filter - optional search criteria.
   * @param signal - optional cancellation signal.
   * @returns array of matching repositories.
   */
  list(filter?: RepositoryFilter, signal?: AbortSignal): Promise<readonly Repository[]>
  /**
   * Get a repository by its unique identifier.
   * @param id - repository identifier.
   * @param signal - optional cancellation signal.
   * @returns matching repository or undefined.
   */
  get(id: RepositoryId, signal?: AbortSignal): Promise<Repository | undefined>
  /**
   * Get a repository by its local filesystem path.
   * @param path - filesystem path.
   * @param signal - optional cancellation signal.
   * @returns matching repository or undefined.
   */
  getByPath(path: string, signal?: AbortSignal): Promise<Repository | undefined>
  /**
   * Add a repository to the catalog.
   * @param request - repository details to add.
   * @param signal - optional cancellation signal.
   * @returns the created repository record.
   */
  add(request: RepositoryAddRequest, signal?: AbortSignal): Promise<Repository>
  /**
   * Remove a repository from the catalog.
   * @param id - repository identifier.
   * @param signal - optional cancellation signal.
   * @returns true if found and removed, false if not found.
   */
  remove(id: RepositoryId, signal?: AbortSignal): Promise<boolean>
  /**
   * Scan filesystem roots for git repositories and register newly found ones.
   * @param request - scan boundaries and constraints.
   * @param signal - optional cancellation signal.
   * @returns scan results.
   */
  scan(request: RepositoryScanRequest, signal?: AbortSignal): Promise<RepositoryScanResult>
}
