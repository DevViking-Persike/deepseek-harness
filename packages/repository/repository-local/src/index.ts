/**
 * Local repository catalog provider for the repository capability seam (`ctx.repositories`).
 * Backed by durable storage domain (`ctx.storageDomain`) and delegating git operations to `ctx.git`.
 * @module @deepseek-ai/dsh-repository-local
 */

import { randomUUID } from 'node:crypto'
import { basename, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-git'
import type {} from '@deepseek-ai/dsh-repository'
import {
  CatalogProviderId,
  ForgeId,
  RepositoryId,
} from '@deepseek-ai/dsh-repository'
import type {
  Repository,
  RepositoryAddRequest,
  RepositoryCatalogProvider,
  RepositoryFilter,
  RepositoryForgeRef,
  RepositoryRemote,
  RepositoryScanRequest,
  RepositoryScanResult,
} from '@deepseek-ai/dsh-repository'
import {
  repositoryDomainSpec,
  type RepositoryRecord,
} from './spec.ts'

export {
  repositoryDomainSpec,
  repositoryDomainState,
  repositoryForgeRefRecord,
  repositoryRecord,
  repositoryRemoteRecord,
  type RepositoryDomainState,
  type RepositoryRecord,
} from './spec.ts'

/** Cordis plugin name. */
export const name = 'repository-local'

/** Required service injections. */
export const inject = ['git', 'storageDomain', 'repositories']

/**
 * Configuration options for the local repository catalog provider.
 */
export interface RepositoryLocalConfig {
  /** Optional custom provider identifier. */
  readonly id?: string
}

/** Schemastery configuration schema. */
export const Config: z<RepositoryLocalConfig> = z.object({
  id: z.string(),
}) as z<RepositoryLocalConfig>

/**
 * Parse forge reference from a git remote URL.
 * @param url - Git remote URL (SSH or HTTPS).
 * @returns Parsed forge reference or undefined if not recognized.
 */
export function parseForgeRef(url: string): RepositoryForgeRef | undefined {
  // Matches https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const githubMatch = /^(?:https?:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/.]+)(?:\.git)?$/.exec(url)
  if (githubMatch !== null && githubMatch[1] !== undefined && githubMatch[2] !== undefined) {
    return {
      forgeId: ForgeId('github'),
      owner: githubMatch[1],
      name: githubMatch[2],
    }
  }

  // Matches https://gitlab.com/owner/repo.git or git@gitlab.com:owner/repo.git
  const gitlabMatch = /^(?:https?:\/\/gitlab\.com\/|git@gitlab\.com:)([^/]+)\/([^/.]+)(?:\.git)?$/.exec(url)
  if (gitlabMatch !== null && gitlabMatch[1] !== undefined && gitlabMatch[2] !== undefined) {
    return {
      forgeId: ForgeId('gitlab'),
      owner: gitlabMatch[1],
      name: gitlabMatch[2],
    }
  }

  return undefined
}

/**
 * Apply the local repository provider plugin to the Cordis context.
 * Opens the persistent storage domain, constructs the catalog provider,
 * and registers it into `ctx.repositories`.
 * @param ctx - Cordis context.
 * @param config - Optional provider configuration.
 * @returns Cleanup disposer function.
 */
export async function apply(ctx: Context, config: RepositoryLocalConfig = {}): Promise<() => void> {
  const domain = await ctx.storageDomain.open(repositoryDomainSpec)
  const providerId = CatalogProviderId(config.id ?? 'local')

  const provider: RepositoryCatalogProvider = {
    id: providerId,

    async available(): Promise<boolean> {
      return true
    },

    async list(filter?: RepositoryFilter, _signal?: AbortSignal): Promise<readonly Repository[]> {
      const table = domain.table('repositories')
      const records = [...table.entries()].map(([, r]) => r)

      return records.filter((repo) => {
        if (filter?.pathPrefix !== undefined && !repo.path.startsWith(filter.pathPrefix)) {
          return false
        }
        if (filter?.nameQuery !== undefined && !repo.name.toLowerCase().includes(filter.nameQuery.toLowerCase())) {
          return false
        }
        if (filter?.forgeId !== undefined && repo.forge?.forgeId !== filter.forgeId) {
          return false
        }
        return true
      })
    },

    async get(id: RepositoryId, _signal?: AbortSignal): Promise<Repository | undefined> {
      return domain.table('repositories').get(id)
    },

    async getByPath(path: string, _signal?: AbortSignal): Promise<Repository | undefined> {
      const normalized = resolve(path)
      for (const [, repo] of domain.table('repositories').entries()) {
        if (resolve(repo.path) === normalized) {
          return repo
        }
      }
      return undefined
    },

    async add(request: RepositoryAddRequest, signal?: AbortSignal): Promise<Repository> {
      const normalizedPath = resolve(request.path)
      const existing = await this.getByPath(normalizedPath, signal)
      if (existing !== undefined) {
        return existing
      }

      // Query git facts via ctx.git
      let currentBranch: string | undefined
      let isClean: boolean | undefined
      try {
        const status = await ctx.git.status(normalizedPath, signal)
        currentBranch = status.branch
        isClean = status.changes.length === 0
      } catch {
        // Path might not have status or git might be optional
      }

      const now = new Date().toISOString()
      const id = RepositoryId(randomUUID())
      const name = request.name ?? basename(normalizedPath)

      let forge: RepositoryForgeRef | undefined
      if (request.remotes !== undefined) {
        for (const remote of request.remotes) {
          const parsed = parseForgeRef(remote.url)
          if (parsed !== undefined) {
            forge = parsed
            break
          }
        }
      }

      const record: RepositoryRecord = {
        id,
        name,
        path: normalizedPath,
        remotes: request.remotes !== undefined ? [...request.remotes] : undefined,
        currentBranch,
        isClean,
        forge,
        createdAt: now,
        updatedAt: now,
        ...(request.metadata !== undefined ? { metadata: request.metadata } : {}),
      }

      // Commit to domain before publishing state
      const global = domain.global.get()
      await domain.table('repositories').put(id, record)
      await domain.global.set({
        initialized: true,
        repositoryIds: [...global.repositoryIds, id],
      })

      // State published strictly after commit
      ctx.emit('repositories/changed', { kind: 'added', repository: record })
      return record
    },

    async remove(id: RepositoryId, _signal?: AbortSignal): Promise<boolean> {
      const existing = domain.table('repositories').get(id)
      if (existing === undefined) {
        return false
      }

      const global = domain.global.get()
      await domain.table('repositories').delete(id)
      await domain.global.set({
        initialized: true,
        repositoryIds: global.repositoryIds.filter(item => item !== id),
      })

      // State published strictly after commit
      ctx.emit('repositories/changed', { kind: 'removed', repository: existing })
      return true
    },

    async scan(request: RepositoryScanRequest, signal?: AbortSignal): Promise<RepositoryScanResult> {
      // Delegate discovery directly to ctx.git with no duplication
      const discoverResult = await ctx.git.discover({
        roots: request.roots,
        maxDepth: request.maxDepth ?? 5,
        limit: request.limit ?? 100,
      }, signal)

      const added: Repository[] = []
      const existing: Repository[] = []

      for (const discovered of discoverResult.repositories) {
        const found = await this.getByPath(discovered.root, signal)
        if (found !== undefined) {
          existing.push(found)
        } else {
          // Query git status facts via ctx.git
          let currentBranch: string | undefined
          let isClean: boolean | undefined
          try {
            const status = await ctx.git.status(discovered.root, signal)
            currentBranch = status.branch
            isClean = status.changes.length === 0
          } catch {
            // Unborn or git error
          }

          const rawDiscovered = discovered as unknown as {
            remotes?: readonly RepositoryRemote[]
            defaultBranch?: string
            currentBranch?: string
            isClean?: boolean
          }
          const remotes = rawDiscovered.remotes
          let forge: RepositoryForgeRef | undefined
          if (remotes !== undefined) {
            for (const remote of remotes) {
              const parsed = parseForgeRef(remote.url)
              if (parsed !== undefined) {
                forge = parsed
                break
              }
            }
          }

          const now = new Date().toISOString()
          const id = RepositoryId(randomUUID())
          const record: RepositoryRecord = {
            id,
            name: discovered.name || basename(discovered.root),
            path: resolve(discovered.root),
            remotes: remotes !== undefined ? [...remotes] : undefined,
            defaultBranch: rawDiscovered.defaultBranch,
            currentBranch: rawDiscovered.currentBranch ?? currentBranch,
            isClean: rawDiscovered.isClean ?? isClean,
            forge,
            createdAt: now,
            updatedAt: now,
          }

          const global = domain.global.get()
          await domain.table('repositories').put(id, record)
          await domain.global.set({
            initialized: true,
            repositoryIds: [...global.repositoryIds, id],
          })

          // Publish state after commit
          ctx.emit('repositories/changed', { kind: 'added', repository: record })
          added.push(record)
        }
      }

      return {
        added,
        existing,
      }
    },
  }

  const unregister = ctx.repositories.registerCatalogProvider(provider)

  return () => {
    unregister()
    void domain.close()
  }
}
