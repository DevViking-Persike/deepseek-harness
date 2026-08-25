import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Repositories from '../../repository/src/index.ts'
import * as RepositoryGithub from '../src/index.ts'

describe('repository-github subplugin', () => {
  it('registers GitHub forge provider on ctx.repositories', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories)
    const fiber = await ctx.plugin(RepositoryGithub)

    const forge = ctx.repositories.getForge('github')
    expect(forge).toBeDefined()
    expect(forge?.displayName).toBe('GitHub')
    expect(forge?.domain).toBe('github.com')

    const capabilities = await forge?.capabilities()
    expect(capabilities).toEqual({
      pullRequests: true,
      issues: true,
      forks: true,
      branches: true,
      codeSearch: true,
      webhooks: true,
    })

    const status = await forge?.status()
    expect(status).toEqual({
      state: 'ready',
      authenticated: false,
      detail: expect.stringContaining('GitHub'),
    })

    // Disposing fiber unregisters the forge
    await fiber.dispose()
    expect(ctx.repositories.getForge('github')).toBeUndefined()
  })

  it('supports custom domain configuration', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories)
    await ctx.plugin(RepositoryGithub, { domain: 'github.enterprise.local' })

    const forge = ctx.repositories.getForge('github')
    expect(forge?.domain).toBe('github.enterprise.local')
  })
})
