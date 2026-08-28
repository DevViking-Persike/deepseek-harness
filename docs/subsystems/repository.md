# Repository Catalog

English | [中文](repository.zh.md)

The repository catalog seam — a [capability seam](../glossary.md#capability-seam) that spans durable catalog management of local git repositories and code-forge provider registration on one `ctx.repositories` service, split across packages: Service Definition ([dsh-repository](../../packages/repository/repository), `ctx.repositories` + the catalog and forge registries), Service Provider ([dsh-repository-local](../../packages/repository/repository-local), a durable catalog over `ctx.storageDomain` that reads git facts through `ctx.git`), and forge subplugins ([dsh-repository-github](../../packages/repository/repository-github) and [dsh-repository-gitlab](../../packages/repository/repository-gitlab), which register forge identity, capabilities, and connection status). Repository is **one optional capability**, not part of the agent-loop spine, so its vocabulary lives here rather than in [core.md](core.md).

Source: [`packages/repository/repository/src/types.ts`](../../packages/repository/repository/src/types.ts)

## Why catalog and forges are one capability

List, get, getByPath, add, remove, and scan all resolve through one selected catalog provider and fail identically when selection fails, so they share one provider-selection policy owner and one error vocabulary (`RepositoryError`, extending `HarnessError` with stable codes). Forge providers are a second registry on the same service: catalog backends and forges are registered by different subplugins, and `listProviders()` reports both together. Catalog providers register a **backend** (a `RepositoryCatalogProvider`), never tools; forge providers register identity and status, not tools.

Catalog provider selection is resolved per operation: a configured id (the `catalogProvider` config field or `DSH_REPOSITORY_CATALOG_PROVIDER`) must be registered and `available()`; with nothing configured, exactly one usable provider must exist. Failures carry `REPOSITORY_PROVIDER_CONFIGURED_MISSING`, `REPOSITORY_PROVIDER_CONFIGURED_UNAVAILABLE`, `REPOSITORY_PROVIDER_UNAVAILABLE`, or `REPOSITORY_PROVIDER_AMBIGUOUS`. Duplicate registrations fail with `REPOSITORY_FORGE_DUPLICATE` or `REPOSITORY_PROVIDER_DUPLICATE`. Availability is probed on every operation rather than cached, for the same reason as the [git seam](git.md): the set of usable backends changes during an ordinary session.

## The catalog

A `Repository` is a catalog record for one local checkout, not the checkout itself: git facts (current branch, clean flag) are snapshots taken when the record was created or scanned, not live state. `RepositoryId` is a [branded id](core.md#branded-ids); consumers never parse it.

```ts type-equiv
/** Opaque identifier for a managed repository. */
type RepositoryId = Branded<'RepositoryId'>
```

```ts type-equiv
/**
 * Represents a repository known to the catalog.
 */
interface Repository {
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
```

`fetchUrl` and `pushUrl` stay optional because Git itself treats them as overrides of one URL: a remote without them uses `url` for both directions.

```ts type-equiv
/**
 * Represents a configured remote on a managed git repository.
 */
interface RepositoryRemote {
  /** Remote name (e.g. 'origin', 'upstream'). */
  readonly name: string
  /** Remote fetch/push URL. */
  readonly url: string
  /** Explicit fetch URL when distinct from url. */
  readonly fetchUrl?: string | undefined
  /** Explicit push URL when distinct from url. */
  readonly pushUrl?: string | undefined
}
```

The forge linkage is derived, not configured by hand: the local provider parses a repository's remote URLs and records owner and name when one matches a known forge domain.

```ts type-equiv
/**
 * Linkage between a repository and an upstream forge.
 */
interface RepositoryForgeRef {
  /** Forge provider identifier. */
  readonly forgeId: ForgeId
  /** Repository owner/organization on the forge. */
  readonly owner: string
  /** Repository name on the forge. */
  readonly name: string
}
```

```ts type-equiv
/**
 * Filter parameters for querying repositories in the catalog.
 */
interface RepositoryFilter {
  /** Filter repositories whose filesystem path starts with this prefix. */
  readonly pathPrefix?: string | undefined
  /** Filter repositories whose name contains this substring (case-insensitive). */
  readonly nameQuery?: string | undefined
  /** Filter repositories linked to this specific forge. */
  readonly forgeId?: ForgeId | undefined
}
```

## Adding and scanning

`add` registers an existing local checkout; `scan` discovers checkouts beneath filesystem roots. Both produce the same change events, emitted only after the record is committed to the catalog backend.

```ts type-equiv
/**
 * Request payload for adding an existing local repository to the catalog.
 */
interface RepositoryAddRequest {
  /** Local filesystem path to the repository root. */
  readonly path: string
  /** Optional custom display name; defaults to directory name if omitted. */
  readonly name?: string | undefined
  /** Optional configured git remotes. */
  readonly remotes?: readonly RepositoryRemote[] | undefined
  /** Optional metadata properties. */
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}
```

```ts type-equiv
/**
 * Request payload for discovering repositories on the filesystem.
 */
interface RepositoryScanRequest {
  /** Root directory paths to scan. */
  readonly roots: readonly string[]
  /** Maximum traversal depth for discovery. */
  readonly maxDepth?: number | undefined
  /** Maximum number of repositories to discover. */
  readonly limit?: number | undefined
}
```

```ts type-equiv
/**
 * Result of a repository scan operation.
 */
interface RepositoryScanResult {
  /** Newly discovered and registered repositories. */
  readonly added: readonly Repository[]
  /** Repositories that were already present in the catalog. */
  readonly existing: readonly Repository[]
  /** Scan errors encountered on specific directory paths. */
  readonly errors?: readonly { readonly path: string; readonly error: string }[] | undefined
}
```

The change event carries the affected record, not a diff: `updated` and `removed` listeners re-read the catalog when they need more than the snapshot.

```ts type-equiv
/**
 * Event payload emitted when a catalog repository changes.
 */
interface RepositoryChangeEvent {
  /** Kind of mutation applied to the repository. */
  readonly kind: 'added' | 'removed' | 'updated'
  /** The affected repository snapshot. */
  readonly repository: Repository
}
```

```ts type-equiv
/**
 * Listener callback for repository catalog mutations.
 */
type RepositoriesChangedListener = (event: RepositoryChangeEvent) => void
```

## Code forges

A forge provider describes one code-hosting service (GitHub, GitLab) the harness can recognize in remote URLs. `ForgeId` is a [branded id](core.md#branded-ids) — `'github'` and `'gitlab'` are the ids the shipped subplugins register.

```ts type-equiv
/** Opaque identifier for a code forge provider (e.g. github, gitlab). */
type ForgeId = Branded<'ForgeId'>
```

Capability flags are declared per forge rather than inferred, so a consumer can decide what to offer without a network round trip. The shipped GitHub and GitLab subplugins declare every flag true.

```ts type-equiv
/**
 * Declared capabilities of a code forge provider.
 */
interface ForgeCapabilities {
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
```

```ts type-equiv
/**
 * Status state of a forge connection.
 */
type ForgeState = 'unconfigured' | 'configured' | 'ready' | 'error'
```

```ts type-equiv
/**
 * Status information for a code forge provider.
 */
interface ForgeStatus {
  /** High-level readiness state of the forge. */
  readonly state: ForgeState
  /** Whether active credentials / authentication exist. */
  readonly authenticated: boolean
  /** Authenticated username or account handle, if available. */
  readonly username?: string | undefined
  /** Human-readable status description or error details. */
  readonly detail?: string | undefined
}
```

```ts type-equiv
/**
 * Code forge provider interface registered into `ctx.repositories`.
 */
interface ForgeProvider {
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
```

The shipped forge subplugins make no network calls: each registers its provider with a configurable domain (GitHub Enterprise or self-hosted GitLab) and reports `state: 'ready'`, `authenticated: false` — an offline registration whose status snapshot is the whole surface.

## Catalog providers

A catalog provider owns persistence and every catalog operation; the service selects one per operation. `CatalogProviderId` is a [branded id](core.md#branded-ids); the local provider registers as `'local'` unless configured otherwise.

```ts type-equiv
/** Opaque identifier for a repository catalog provider. */
type CatalogProviderId = Branded<'CatalogProviderId'>
```

```ts type-equiv
/**
 * Provider interface for local catalog persistence and management operations.
 */
interface RepositoryCatalogProvider {
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
```

The local provider persists records in a `repository_catalog` storage domain (version 1: a `repositories` table plus a global `repositoryIds` list), resolves paths before comparing them, and treats `add` as idempotent by path — adding a path already in the catalog returns the existing record. Git facts come from `ctx.git`: `status` supplies the current branch and clean flag when the path is a readable repository, and `scan` delegates discovery to `ctx.git.discover` (default depth 5, default limit 100). Forge linkage is parsed from remote URLs matching `github.com` or `gitlab.com` in HTTPS or SSH form. `repositories/changed` is emitted only after the record is committed to storage.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxrepositories--repositories"></a>

### `ctx.repositories` — `Repositories`

The Repositories service registered as `ctx.repositories`. Coordinates repository catalog backends and forge provider subplugins.

```ts cordis-catalog
/**
 * Register a code forge provider (e.g. GitHub, GitLab).
 * @param forge - The forge provider to register.
 * @returns A synchronous disposer that unregisters the forge.
 */
registerForge(forge: ForgeProvider): () => void

/**
 * Register a repository catalog provider.
 * @param provider - The catalog backend to register.
 * @returns A synchronous disposer that unregisters the catalog provider.
 */
registerCatalogProvider(provider: RepositoryCatalogProvider): () => void

/**
 * List all registered forge providers.
 * @returns Array of registered forge providers.
 */
listForges(): readonly ForgeProvider[]

/**
 * Get a registered forge provider by its identifier.
 * @param id - The forge identifier.
 * @returns The matching forge provider or undefined if not registered.
 */
getForge(id: ForgeId | string): ForgeProvider | undefined

/**
 * List identifiers of all registered catalog providers and forge providers.
 * @returns Object containing arrays of catalog provider ids and forge ids.
 */
listProviders(): { readonly catalogProviders: readonly string[]; readonly forges: readonly string[] }

/**
 * Subscribe to repository change notifications.
 * @param listener - Callback invoked when a repository is added, removed, or updated.
 * @returns Disposer function to cancel the subscription.
 */
subscribe(listener: RepositoriesChangedListener): () => void

/**
 * List repositories from the catalog matching optional filter criteria.
 * @param filter - Optional repository filter.
 * @param signal - Optional cancellation signal.
 * @returns List of matching repositories.
 */
async list(filter?: RepositoryFilter, signal?: AbortSignal): Promise<readonly Repository[]>

/**
 * Get a repository by its identifier.
 * @param id - The repository identifier.
 * @param signal - Optional cancellation signal.
 * @returns The repository or undefined if not found.
 */
async get(id: RepositoryId, signal?: AbortSignal): Promise<Repository | undefined>

/**
 * Get a repository by its filesystem path.
 * @param path - Filesystem path to lookup.
 * @param signal - Optional cancellation signal.
 * @returns The repository or undefined if not found.
 */
async getByPath(path: string, signal?: AbortSignal): Promise<Repository | undefined>

/**
 * Add a repository to the catalog.
 * @param request - Repository creation request.
 * @param signal - Optional cancellation signal.
 * @returns The added repository.
 */
async add(request: RepositoryAddRequest, signal?: AbortSignal): Promise<Repository>

/**
 * Remove a repository from the catalog by its identifier.
 * @param id - The repository identifier.
 * @param signal - Optional cancellation signal.
 * @returns True if removed, false if not found.
 */
async remove(id: RepositoryId, signal?: AbortSignal): Promise<boolean>

/**
 * Scan filesystem roots for repositories and register discovered items.
 * @param request - Scan constraints and roots.
 * @param signal - Optional cancellation signal.
 * @returns Scan summary with added and existing repositories.
 */
async scan(request: RepositoryScanRequest, signal?: AbortSignal): Promise<RepositoryScanResult>
```

Source: [`packages/repository/repository/src/index.ts:84`](../../packages/repository/repository/src/index.ts)

<a id="repositories-events"></a>

### `repositories/*` events

<a id="repositorieschanged--emit"></a>

#### `repositories/changed` — emit

A repository in the catalog was added, updated, or removed.

```ts cordis-catalog
/**
 * A repository in the catalog was added, updated, or removed.
 * @param event - change details and affected repository.
 * @mode emit
 */
'repositories/changed'(event: RepositoryChangeEvent): void
```

Source: [`packages/repository/repository/src/index.ts:54`](../../packages/repository/repository/src/index.ts)

<a id="repositoriesforge-registered--emit"></a>

#### `repositories/forge-registered` — emit

A forge provider was registered.

```ts cordis-catalog
/**
 * A forge provider was registered.
 * @param forge - registered forge provider.
 * @mode emit
 */
'repositories/forge-registered'(forge: ForgeProvider): void
```

Source: [`packages/repository/repository/src/index.ts:61`](../../packages/repository/repository/src/index.ts)

<a id="repositoriesforge-unregistered--emit"></a>

#### `repositories/forge-unregistered` — emit

A forge provider was unregistered.

```ts cordis-catalog
/**
 * A forge provider was unregistered.
 * @param forgeId - identifier of the unregistered forge.
 * @mode emit
 */
'repositories/forge-unregistered'(forgeId: ForgeId): void
```

Source: [`packages/repository/repository/src/index.ts:68`](../../packages/repository/repository/src/index.ts)
<!-- END GENERATED cordis-surface -->
