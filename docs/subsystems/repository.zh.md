# 仓库目录

[English](repository.md) | 中文

仓库目录 seam —— 一个[能力 seam](../glossary.md#capability-seam)，在同一个 `ctx.repositories` 服务上涵盖本地 git 仓库的持久化目录管理与代码 forge 提供方注册，并跨包拆分：Service Definition（[dsh-repository](../../packages/repository/repository)，`ctx.repositories` 与目录/forge 注册表）、Service Provider（[dsh-repository-local](../../packages/repository/repository-local)，基于 `ctx.storageDomain` 的持久化目录，经 `ctx.git` 读取 git 事实）、forge 子插件（[dsh-repository-github](../../packages/repository/repository-github) 与 [dsh-repository-gitlab](../../packages/repository/repository-gitlab)，注册 forge 身份、能力与连接状态）。仓库是**一项可选能力**，不属于 agent-loop 主干，因此其词汇位于此处而非 [core.md](core.md)。

来源：[`packages/repository/repository/src/types.ts`](../../packages/repository/repository/src/types.ts)

## 为什么目录与 forge 是同一项能力

list、get、getByPath、add、remove 与 scan 都通过同一个被选中的目录提供方解析，并在选择失败时以相同方式失败，因此它们共享同一个提供方选择策略归属者与同一套错误词汇（`RepositoryError`，继承 `HarnessError` 并携带稳定错误码）。Forge 提供方是同一服务上的第二个注册表：目录后端与 forge 由不同子插件注册，而 `listProviders()` 将两者一同上报。目录提供方注册的是**后端**（一个 `RepositoryCatalogProvider`），绝非工具；forge 提供方注册的是身份与状态，而非工具。

目录提供方的选择按操作解析：配置的 id（`catalogProvider` 配置字段或 `DSH_REPOSITORY_CATALOG_PROVIDER`）必须已注册且 `available()`；未配置时必须恰好存在一个可用提供方。失败分别携带 `REPOSITORY_PROVIDER_CONFIGURED_MISSING`、`REPOSITORY_PROVIDER_CONFIGURED_UNAVAILABLE`、`REPOSITORY_PROVIDER_UNAVAILABLE` 或 `REPOSITORY_PROVIDER_AMBIGUOUS`。重复注册以 `REPOSITORY_FORGE_DUPLICATE` 或 `REPOSITORY_PROVIDER_DUPLICATE` 失败。可用性按操作探测而非缓存，理由与 [git seam](git.md) 相同：可用后端的集合会在一次普通会话中变化。

## 目录

`Repository` 是一个本地检出的目录记录，而非检出本身：git 事实（当前分支、干净标志）是创建或扫描记录时的快照，不是实时状态。`RepositoryId` 是[品牌化 id](core.md#branded-ids)；消费方不解析它。

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

`fetchUrl` 与 `pushUrl` 保持可选，因为 Git 本身就把它们当作对单一 URL 的覆盖：不带它们的 remote 在两个方向上都使用 `url`。

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

forge 关联是推导出来的，而非手工配置：本地提供方解析仓库的 remote URL，并在某个 URL 匹配已知 forge 域名时记录 owner 与 name。

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

## 添加与扫描

`add` 登记一个已存在的本地检出；`scan` 在文件系统根目录之下发现检出。两者产生相同的变更事件，且仅在记录提交到目录后端之后发出。

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

变更事件携带受影响的记录而非 diff：需要快照之外信息的 `updated` 与 `removed` 监听方会重新读取目录。

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

## 代码 forge

forge 提供方描述 harness 能在 remote URL 中识别的一个代码托管服务（GitHub、GitLab）。`ForgeId` 是[品牌化 id](core.md#branded-ids)——随仓库发布的子插件注册的 id 是 `'github'` 与 `'gitlab'`。

```ts type-equiv
/** Opaque identifier for a code forge provider (e.g. github, gitlab). */
type ForgeId = Branded<'ForgeId'>
```

能力标志按 forge 声明而非推导，使消费方无需网络往返即可决定提供什么。随仓库发布的 GitHub 与 GitLab 子插件将所有标志声明为 true。

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

随仓库发布的 forge 子插件不发起网络调用：各自以可配置的域名（GitHub Enterprise 或自托管 GitLab）注册其提供方，并报告 `state: 'ready'`、`authenticated: false`——一个离线注册，其状态快照即是全部内容。

## 目录提供方

目录提供方拥有持久化与全部目录操作；服务按操作选择其一。`CatalogProviderId` 是[品牌化 id](core.md#branded-ids)；本地提供方默认以 `'local'` 注册，除非另行配置。

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

本地提供方将记录持久化到 `repository_catalog` 存储域（版本 1：一张 `repositories` 表加上全局 `repositoryIds` 列表），在比较之前先解析路径，并按路径将 `add` 视为幂等——添加目录中已存在的路径会返回既有记录。git 事实来自 `ctx.git`：当路径是可读仓库时由 `status` 提供当前分支与干净标志，`scan` 将发现工作委托给 `ctx.git.discover`（默认深度 5、默认上限 100）。forge 关联从匹配 `github.com` 或 `gitlab.com`（HTTPS 或 SSH 形式）的 remote URL 解析得出。`repositories/changed` 仅在记录提交到存储之后发出。

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
