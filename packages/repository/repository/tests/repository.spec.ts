import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Repositories, {
  CatalogProviderId,
  ForgeId,
  RepositoryError,
  RepositoryId,
} from '../src/index.ts'
import type {
  ForgeProvider,
  Repository,
  RepositoryCatalogProvider,
  RepositoryChangeEvent,
} from '../src/index.ts'

describe('Repositories service', () => {
  it('registers and lists forge providers with lifecycle disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories)

    const events: Array<{ type: string; id: string }> = []
    ctx.on('repositories/forge-registered', (forge) => {
      events.push({ type: 'registered', id: forge.id })
    })
    ctx.on('repositories/forge-unregistered', (forgeId) => {
      events.push({ type: 'unregistered', id: forgeId })
    })

    const githubForge: ForgeProvider = {
      id: ForgeId('github'),
      displayName: 'GitHub',
      domain: 'github.com',
      capabilities: () => ({
        pullRequests: true,
        issues: true,
        forks: true,
        branches: true,
        codeSearch: true,
        webhooks: true,
      }),
      status: async () => ({
        state: 'ready',
        authenticated: false,
        detail: 'ready',
      }),
    }

    const dispose = ctx.repositories.registerForge(githubForge)

    expect(ctx.repositories.listForges()).toHaveLength(1)
    expect(ctx.repositories.getForge('github')).toBe(githubForge)
    expect(ctx.repositories.listProviders().forges).toEqual(['github'])
    expect(events).toEqual([{ type: 'registered', id: 'github' }])

    // Duplicate registration should throw
    expect(() => ctx.repositories.registerForge(githubForge)).toThrow(RepositoryError)

    // Dispose
    dispose()
    expect(ctx.repositories.listForges()).toHaveLength(0)
    expect(ctx.repositories.getForge('github')).toBeUndefined()
    expect(events).toEqual([
      { type: 'registered', id: 'github' },
      { type: 'unregistered', id: 'github' },
    ])
  })

  it('delegates catalog operations to registered provider', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories)

    const sampleRepo: Repository = {
      id: RepositoryId('repo-1'),
      name: 'my-project',
      path: '/path/to/my-project',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    }

    const mockProvider: RepositoryCatalogProvider = {
      id: CatalogProviderId('mock'),
      available: async () => true,
      list: vi.fn(async () => [sampleRepo]),
      get: vi.fn(async id => (id === sampleRepo.id ? sampleRepo : undefined)),
      getByPath: vi.fn(async p => (p === sampleRepo.path ? sampleRepo : undefined)),
      add: vi.fn(async () => sampleRepo),
      remove: vi.fn(async () => true),
      scan: vi.fn(async () => ({ added: [sampleRepo], existing: [] })),
    }

    // Calling before provider registered throws REPOSITORY_PROVIDER_UNAVAILABLE
    await expect(ctx.repositories.list()).rejects.toThrow(RepositoryError)

    const dispose = ctx.repositories.registerCatalogProvider(mockProvider)
    expect(ctx.repositories.listProviders().catalogProviders).toEqual(['mock'])

    // Duplicate provider registration throws
    expect(() => ctx.repositories.registerCatalogProvider(mockProvider)).toThrow(RepositoryError)

    // Delegated calls
    const list = await ctx.repositories.list()
    expect(list).toEqual([sampleRepo])
    expect(mockProvider.list).toHaveBeenCalled()

    const repo = await ctx.repositories.get(RepositoryId('repo-1'))
    expect(repo).toEqual(sampleRepo)

    const byPath = await ctx.repositories.getByPath('/path/to/my-project')
    expect(byPath).toEqual(sampleRepo)

    const added = await ctx.repositories.add({ path: '/path/to/my-project' })
    expect(added).toEqual(sampleRepo)

    const removed = await ctx.repositories.remove(RepositoryId('repo-1'))
    expect(removed).toBe(true)

    const scan = await ctx.repositories.scan({ roots: ['/path'] })
    expect(scan.added).toEqual([sampleRepo])

    // Subscription
    const changedEvents: RepositoryChangeEvent[] = []
    const unsub = ctx.repositories.subscribe(e => changedEvents.push(e))
    ctx.emit('repositories/changed', { kind: 'added', repository: sampleRepo })
    expect(changedEvents).toEqual([{ kind: 'added', repository: sampleRepo }])
    unsub()

    dispose()
    await expect(ctx.repositories.list()).rejects.toThrow(RepositoryError)
  })

  it('handles configured catalog provider selection', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories, { catalogProvider: 'custom' })

    const providerA: RepositoryCatalogProvider = {
      id: CatalogProviderId('a'),
      available: async () => true,
      list: vi.fn(async () => []),
      get: vi.fn(),
      getByPath: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      scan: vi.fn(),
    }

    const providerCustom: RepositoryCatalogProvider = {
      id: CatalogProviderId('custom'),
      available: async () => true,
      list: vi.fn(async () => []),
      get: vi.fn(),
      getByPath: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      scan: vi.fn(),
    }

    ctx.repositories.registerCatalogProvider(providerA)
    // Configured 'custom' is missing -> throws
    await expect(ctx.repositories.list()).rejects.toThrow(/configured repository catalog provider "custom" is not registered/)

    ctx.repositories.registerCatalogProvider(providerCustom)
    await ctx.repositories.list()
    expect(providerCustom.list).toHaveBeenCalled()
    expect(providerA.list).not.toHaveBeenCalled()
  })

  it('rejects ambiguous providers when multiple are usable and none configured', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories)

    const p1: RepositoryCatalogProvider = {
      id: CatalogProviderId('p1'),
      available: async () => true,
      list: vi.fn(async () => []),
      get: vi.fn(),
      getByPath: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      scan: vi.fn(),
    }
    const p2: RepositoryCatalogProvider = {
      id: CatalogProviderId('p2'),
      available: async () => true,
      list: vi.fn(async () => []),
      get: vi.fn(),
      getByPath: vi.fn(),
      add: vi.fn(),
      remove: vi.fn(),
      scan: vi.fn(),
    }

    ctx.repositories.registerCatalogProvider(p1)
    ctx.repositories.registerCatalogProvider(p2)

    await expect(ctx.repositories.list()).rejects.toThrow(RepositoryError)
  })
})
