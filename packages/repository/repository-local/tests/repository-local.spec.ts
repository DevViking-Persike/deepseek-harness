import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import Repositories, { ForgeId } from '../../repository/src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as RepositoryLocal from '../src/index.ts'

interface HarnessOptions {
  /**
   * What `ctx.git.discover` reports: GitRepository is identity only, so a
   * fake that adds remotes or branch fields would describe a service the
   * harness does not have.
   */
  discoveredRepos?: Array<{
    root: string
    name?: string
    workspacePath?: string
    submodule?: boolean
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
    repositories: (options.discoveredRepos ?? []).map(repo => ({
      root: repo.root,
      name: repo.name ?? repo.root.split('/').pop() ?? repo.root,
      workspacePath: repo.workspacePath ?? '/code',
      submodule: repo.submodule ?? false,
    })),
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

  it('scans roots into records carrying the status facts discovery does not report', async () => {
    // GitRepository reports identity only (root, name, workspacePath,
    // submodule). Branch and cleanliness come from a separate status call, and
    // remotes are not discovered at all — so a scanned record carries no forge
    // reference until `add` resolves one from a remote URL.
    const { ctx, discoverMock } = await harness({
      discoveredRepos: [
        { root: '/code/github-project' },
        { root: '/code/gitlab-project' },
      ],
    })

    const scanResult = await ctx.repositories.scan({ roots: ['/code'] })
    expect(discoverMock).toHaveBeenCalledWith(
      expect.objectContaining({ roots: ['/code'] }),
      undefined,
    )

    expect(scanResult.added).toHaveLength(2)
    const githubRepo = scanResult.added.find(r => r.name === 'github-project')
    expect(githubRepo?.path).toBe('/code/github-project')
    expect(githubRepo?.forge).toBeUndefined()
    expect(githubRepo?.remotes).toBeUndefined()

    // Second scan reports existing
    const secondScan = await ctx.repositories.scan({ roots: ['/code'] })
    expect(secondScan.added).toHaveLength(0)
    expect(secondScan.existing).toHaveLength(2)
  })

  it('resolves the forge reference when a repository is added with a remote', async () => {
    // The forge parse belongs to `add`, which receives the remote URL the
    // caller supplies; this is the path that populates `forge` and the one
    // `list({ forgeId })` filters on.
    const { ctx } = await harness()

    await ctx.repositories.add({
      path: '/code/project-a',
      remotes: [{ name: 'origin', url: 'git@github.com:deepseek-ai/project-a.git' }],
    })
    await ctx.repositories.add({
      path: '/code/project-b',
      remotes: [{ name: 'origin', url: 'https://gitlab.com/group-b/project-b.git' }],
    })

    const githubOnly = await ctx.repositories.list({ forgeId: ForgeId('github') })
    expect(githubOnly).toHaveLength(1)
    expect(githubOnly[0]?.forge).toEqual({
      forgeId: ForgeId('github'),
      owner: 'deepseek-ai',
      name: 'project-a',
    })

    const gitlabOnly = await ctx.repositories.list({ forgeId: ForgeId('gitlab') })
    expect(gitlabOnly[0]?.forge).toEqual({
      forgeId: ForgeId('gitlab'),
      owner: 'group-b',
      name: 'project-b',
    })
  })

  it('unregisters cleanly on fiber disposal', async () => {
    const { ctx, fiber } = await harness()

    expect(ctx.repositories.listProviders().catalogProviders).toContain('local')

    await fiber.dispose()

    expect(ctx.repositories.listProviders().catalogProviders).not.toContain('local')
  })
})
