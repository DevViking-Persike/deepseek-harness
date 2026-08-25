import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Repositories from '../../repository/src/index.ts'
import * as RepositoryGitlab from '../src/index.ts'

describe('repository-gitlab subplugin', () => {
  it('registers GitLab forge provider on ctx.repositories', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories)
    const fiber = await ctx.plugin(RepositoryGitlab)

    const forge = ctx.repositories.getForge('gitlab')
    expect(forge).toBeDefined()
    expect(forge?.displayName).toBe('GitLab')
    expect(forge?.domain).toBe('gitlab.com')

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
      detail: expect.stringContaining('GitLab'),
    })

    // Disposing fiber unregisters the forge
    await fiber.dispose()
    expect(ctx.repositories.getForge('gitlab')).toBeUndefined()
  })

  it('supports custom domain configuration for self-hosted instances', async () => {
    const ctx = new Context()
    await ctx.plugin(Repositories)
    await ctx.plugin(RepositoryGitlab, { domain: 'gitlab.mycompany.org' })

    const forge = ctx.repositories.getForge('gitlab')
    expect(forge?.domain).toBe('gitlab.mycompany.org')
  })
})
