/**
 * Service Definition for the Repository capability seam (`ctx.repositories`):
 * a provider registry and execution coordinator for repository catalog management
 * and forge subplugin registrations.
 * @module @deepseek-ai/dsh-repository
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ForgeId, RepositoryId } from './brand.ts'
import type {
  ForgeProvider,
  RepositoriesChangedListener,
  Repository,
  RepositoryAddRequest,
  RepositoryChangeEvent,
  RepositoryFilter,
  RepositoryScanRequest,
  RepositoryScanResult,
  RepositoryCatalogProvider,
} from './types.ts'
import { RepositoryError } from './types.ts'

export { CatalogProviderId, ForgeId, RepositoryId } from './brand.ts'
export { RepositoryError } from './types.ts'
export type {
  ForgeCapabilities,
  ForgeProvider,
  ForgeState,
  ForgeStatus,
  RepositoriesChangedListener,
  Repository,
  RepositoryAddRequest,
  RepositoryChangeEvent,
  RepositoryFilter,
  RepositoryForgeRef,
  RepositoryRemote,
  RepositoryScanRequest,
  RepositoryScanResult,
  RepositoryCatalogProvider,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    repositories: Repositories
  }

  interface Events {
    /**
     * A repository in the catalog was added, updated, or removed.
     * @param event - change details and affected repository.
     * @mode emit
     */
    'repositories/changed'(event: RepositoryChangeEvent): void

    /**
     * A forge provider was registered.
     * @param forge - registered forge provider.
     * @mode emit
     */
    'repositories/forge-registered'(forge: ForgeProvider): void

    /**
     * A forge provider was unregistered.
     * @param forgeId - identifier of the unregistered forge.
     * @mode emit
     */
    'repositories/forge-unregistered'(forgeId: ForgeId): void
  }
}

/**
 * Configuration options for the Repositories service.
 */
export interface RepositoriesConfig {
  /** Explicit catalog provider identifier to select. */
  readonly catalogProvider?: string
}

/**
 * The Repositories service registered as `ctx.repositories`.
 * Coordinates repository catalog backends and forge provider subplugins.
 */
export class Repositories extends Service {
  /** Schemastery configuration validator. */
  static Config: z<RepositoriesConfig> = z.object({
    catalogProvider: z.string(),
  }) as z<RepositoriesConfig>

  /** Registered forge providers keyed by ForgeId. */
  private readonly forges = new Map<string, ForgeProvider>()

  /** Registered repository catalog backends keyed by CatalogProviderId. */
  private readonly catalogProviders = new Map<string, RepositoryCatalogProvider>()

  /** Explicit catalog provider identifier, if configured. */
  private readonly configuredCatalogProviderId: string | undefined

  /**
   * Initialize the Repositories service on the Cordis context.
   * @param ctx - Cordis context.
   * @param config - Optional configuration.
   */
  constructor(ctx: Context, config: RepositoriesConfig = {}) {
    super(ctx, 'repositories')
    this.configuredCatalogProviderId = config.catalogProvider ?? process.env.DSH_REPOSITORY_CATALOG_PROVIDER
  }

  /**
   * Register a code forge provider (e.g. GitHub, GitLab).
   * @param forge - The forge provider to register.
   * @returns A synchronous disposer that unregisters the forge.
   */
  registerForge(forge: ForgeProvider): () => void {
    if (this.forges.has(forge.id)) {
      throw new RepositoryError(
        `forge provider "${forge.id}" is already registered`,
        'REPOSITORY_FORGE_DUPLICATE',
      )
    }
    const forges = this.forges
    const ctx = this.ctx
    const dispose = this.ctx.effect(function* () {
      forges.set(forge.id, forge)
      ctx.emit('repositories/forge-registered', forge)
      yield () => {
        forges.delete(forge.id)
        ctx.emit('repositories/forge-unregistered', forge.id)
      }
    }, 'repositories.registerForge()')
    return () => void dispose()
  }

  /**
   * Register a repository catalog provider.
   * @param provider - The catalog backend to register.
   * @returns A synchronous disposer that unregisters the catalog provider.
   */
  registerCatalogProvider(provider: RepositoryCatalogProvider): () => void {
    if (this.catalogProviders.has(provider.id)) {
      throw new RepositoryError(
        `repository catalog provider "${provider.id}" is already registered`,
        'REPOSITORY_PROVIDER_DUPLICATE',
      )
    }
    const catalogProviders = this.catalogProviders
    const dispose = this.ctx.effect(function* () {
      catalogProviders.set(provider.id, provider)
      yield () => {
        catalogProviders.delete(provider.id)
      }
    }, 'repositories.registerCatalogProvider()')
    return () => void dispose()
  }

  /**
   * List all registered forge providers.
   * @returns Array of registered forge providers.
   */
  listForges(): readonly ForgeProvider[] {
    return [...this.forges.values()]
  }

  /**
   * Get a registered forge provider by its identifier.
   * @param id - The forge identifier.
   * @returns The matching forge provider or undefined if not registered.
   */
  getForge(id: ForgeId | string): ForgeProvider | undefined {
    return this.forges.get(id)
  }

  /**
   * List identifiers of all registered catalog providers and forge providers.
   * @returns Object containing arrays of catalog provider ids and forge ids.
   */
  listProviders(): { readonly catalogProviders: readonly string[]; readonly forges: readonly string[] } {
    return {
      catalogProviders: [...this.catalogProviders.keys()],
      forges: [...this.forges.keys()],
    }
  }

  /**
   * Subscribe to repository change notifications.
   * @param listener - Callback invoked when a repository is added, removed, or updated.
   * @returns Disposer function to cancel the subscription.
   */
  subscribe(listener: RepositoriesChangedListener): () => void {
    return this.ctx.on('repositories/changed', listener)
  }

  /**
   * Resolve the active repository catalog provider backend.
   * @returns The selected usable catalog provider.
   */
  private async selectCatalogProvider(): Promise<RepositoryCatalogProvider> {
    const configuredId = this.configuredCatalogProviderId
    if (configuredId !== undefined && configuredId.length > 0) {
      const configured = this.catalogProviders.get(configuredId)
      if (configured === undefined) {
        throw new RepositoryError(
          `configured repository catalog provider "${configuredId}" is not registered`,
          'REPOSITORY_PROVIDER_CONFIGURED_MISSING',
        )
      }
      if (!await configured.available()) {
        throw new RepositoryError(
          `configured repository catalog provider "${configuredId}" is unavailable`,
          'REPOSITORY_PROVIDER_CONFIGURED_UNAVAILABLE',
        )
      }
      return configured
    }

    const usable: RepositoryCatalogProvider[] = []
    for (const provider of this.catalogProviders.values()) {
      if (await provider.available()) {
        usable.push(provider)
      }
    }

    const [only] = usable
    if (only === undefined) {
      throw new RepositoryError(
        'no usable repository catalog provider is registered',
        'REPOSITORY_PROVIDER_UNAVAILABLE',
      )
    }
    if (usable.length > 1) {
      throw new RepositoryError(
        `several usable repository catalog providers (${usable.map(p => p.id).join(', ')}); set catalogProvider config`,
        'REPOSITORY_PROVIDER_AMBIGUOUS',
      )
    }
    return only
  }

  /**
   * List repositories from the catalog matching optional filter criteria.
   * @param filter - Optional repository filter.
   * @param signal - Optional cancellation signal.
   * @returns List of matching repositories.
   */
  async list(filter?: RepositoryFilter, signal?: AbortSignal): Promise<readonly Repository[]> {
    const provider = await this.selectCatalogProvider()
    return provider.list(filter, signal)
  }

  /**
   * Get a repository by its identifier.
   * @param id - The repository identifier.
   * @param signal - Optional cancellation signal.
   * @returns The repository or undefined if not found.
   */
  async get(id: RepositoryId, signal?: AbortSignal): Promise<Repository | undefined> {
    const provider = await this.selectCatalogProvider()
    return provider.get(id, signal)
  }

  /**
   * Get a repository by its filesystem path.
   * @param path - Filesystem path to lookup.
   * @param signal - Optional cancellation signal.
   * @returns The repository or undefined if not found.
   */
  async getByPath(path: string, signal?: AbortSignal): Promise<Repository | undefined> {
    const provider = await this.selectCatalogProvider()
    return provider.getByPath(path, signal)
  }

  /**
   * Add a repository to the catalog.
   * @param request - Repository creation request.
   * @param signal - Optional cancellation signal.
   * @returns The added repository.
   */
  async add(request: RepositoryAddRequest, signal?: AbortSignal): Promise<Repository> {
    const provider = await this.selectCatalogProvider()
    return provider.add(request, signal)
  }

  /**
   * Remove a repository from the catalog by its identifier.
   * @param id - The repository identifier.
   * @param signal - Optional cancellation signal.
   * @returns True if removed, false if not found.
   */
  async remove(id: RepositoryId, signal?: AbortSignal): Promise<boolean> {
    const provider = await this.selectCatalogProvider()
    return provider.remove(id, signal)
  }

  /**
   * Scan filesystem roots for repositories and register discovered items.
   * @param request - Scan constraints and roots.
   * @param signal - Optional cancellation signal.
   * @returns Scan summary with added and existing repositories.
   */
  async scan(request: RepositoryScanRequest, signal?: AbortSignal): Promise<RepositoryScanResult> {
    const provider = await this.selectCatalogProvider()
    return provider.scan(request, signal)
  }
}

export default Repositories
