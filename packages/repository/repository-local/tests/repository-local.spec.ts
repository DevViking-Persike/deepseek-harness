import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import Repositories, { ForgeId } from '../../repository/src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as RepositoryLocal from '../src/index.ts'

interface HarnessOptions {
  discoveredRepos?: Array<{
    root: string
    remotes: Array<{ name: string; url: string }>
    defaultBranch?: string
    currentBranch?: string
    isClean?: boolean
  }>
  gitStatus?: {
    branch?: string
    changes: string[]
  }
}

async function harness(options: HarnessOptions = {}) {
  const ctx = new Context()

  // Storage setup
  const pool = new MemoryMediaPool()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)

  // Repositories service
  await ctx.plugin(Repositories)

  // Mock Git service
  const discoverMock = vi.fn(async () => ({
    repositories: options.discoveredRepos ?? [],
    truncated: false,
  }))
  const statusMock = vi.fn(async () => options.gitStatus ?? { branch: 'main', changes: [] })
  ctx.provide('git', {
    discover: discoverMock,
    status: statusMock,
  } as never)

  // Apply repository-local plugin
  const fiber = await ctx.plugin(RepositoryLocal)

  return {
    ctx,
    fiber,
    discoverMock,
    statusMock,
  }
}

describe('repository-local provider', () => {
  it('registers local catalog provider and handles add/get/list/remove lifecycle', async () => {
    const { ctx } = await harness()

    const listEmpty = await ctx.repositories.list()
    expect(listEmpty).toEqual([])

    const changes: unknown[] = []
    ctx.on('repositories/changed', (e) => {
      changes.push(e)
    })

    // Add repository
    const added = await ctx.repositories.add({
      path: '/dev/my-app',
      name: 'my-app',
    })

    expect(added.name).toBe('my-app')
    expect(added.path).toBe('/dev/my-app')
    expect(added.currentBranch).toBe('main')
    expect(added.isClean).toBe(true)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual({ kind: 'added', repository: added })

    // Get by ID
    const fetched = await ctx.repositories.get(added.id)
    expect(fetched).toEqual(added)

    // Get by Path
    const fetchedByPath = await ctx.repositories.getByPath('/dev/my-app')
    expect(fetchedByPath).toEqual(added)

    // List with query
    const list = await ctx.repositories.list({ nameQuery: 'my' })
    expect(list).toEqual([added])

    const listNoMatch = await ctx.repositories.list({ nameQuery: 'other' })
    expect(listNoMatch).toEqual([])

    // Remove
    const removed = await ctx.repositories.remove(added.id)
    expect(removed).toBe(true)
    expect(changes).toHaveLength(2)
    expect(changes[1]).toEqual({ kind: 'removed', repository: added })

    const listAfterRemove = await ctx.repositories.list()
    expect(listAfterRemove).toEqual([])
  })

  it('scans roots and parses forge metadata from git remotes', async () => {
    const { ctx, discoverMock } = await harness({
      discoveredRepos: [
        {
          root: '/code/github-project',
          remotes: [
            { name: 'origin', url: 'git@github.com:deepseek-ai/project-a.git' },
          ],
          defaultBranch: 'main',
          currentBranch: 'main',
          isClean: true,
        },
        {
          root: '/code/gitlab-project',
          remotes: [
            { name: 'origin', url: 'https://gitlab.com/group-b/project-b.git' },
          ],
          defaultBranch: 'master',
          currentBranch: 'feature',
          isClean: false,
        },
      ],
    })

    const scanResult = await ctx.repositories.scan({ roots: ['/code'] })
    expect(discoverMock).toHaveBeenCalledWith(
      expect.objectContaining({ roots: ['/code'] }),
      undefined,
    )

    expect(scanResult.added).toHaveLength(2)
    const githubRepo = scanResult.added.find(r => r.name === 'github-project')
    expect(githubRepo?.forge).toEqual({
      forgeId: ForgeId('github'),
      owner: 'deepseek-ai',
      name: 'project-a',
    })

    const gitlabRepo = scanResult.added.find(r => r.name === 'gitlab-project')
    expect(gitlabRepo?.forge).toEqual({
      forgeId: ForgeId('gitlab'),
      owner: 'group-b',
      name: 'project-b',
    })

    // Filter by forge
    const githubOnly = await ctx.repositories.list({ forgeId: ForgeId('github') })
    expect(githubOnly).toHaveLength(1)
    expect(githubOnly[0]?.name).toBe('github-project')

    // Second scan reports existing
    const secondScan = await ctx.repositories.scan({ roots: ['/code'] })
    expect(secondScan.added).toHaveLength(0)
    expect(secondScan.existing).toHaveLength(2)
  })

  it('unregisters cleanly on fiber disposal', async () => {
    const { ctx, fiber } = await harness()

    expect(ctx.repositories.listProviders().catalogProviders).toContain('local')

    await fiber.dispose()

    expect(ctx.repositories.listProviders().catalogProviders).not.toContain('local')
  })
})
