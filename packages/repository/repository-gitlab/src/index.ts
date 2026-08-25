/**
 * GitLab code forge subplugin for the repository capability seam (`ctx.repositories`).
 * Registers GitLab forge identity, capabilities, and connection status on the host.
 * @module @deepseek-ai/dsh-repository-gitlab
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-repository'
import { ForgeId } from '@deepseek-ai/dsh-repository'
import type {
  ForgeCapabilities,
  ForgeProvider,
  ForgeStatus,
} from '@deepseek-ai/dsh-repository'

/** Cordis plugin name. */
export const name = 'repository-gitlab'

/** Required service injections. */
export const inject = ['repositories']

/**
 * Configuration options for the GitLab forge subplugin.
 */
export interface RepositoryGitlabConfig {
  /** Custom domain for self-hosted GitLab instances (defaults to 'gitlab.com'). */
  readonly domain?: string
}

/** Schemastery configuration schema. */
export const Config: z<RepositoryGitlabConfig> = z.object({
  domain: z.string(),
}) as z<RepositoryGitlabConfig>

/**
 * Create a GitLab forge provider instance.
 * @param config - Configuration options.
 * @returns Configured ForgeProvider instance for GitLab.
 */
export function createGitlabForgeProvider(config: RepositoryGitlabConfig = {}): ForgeProvider {
  const domain = config.domain ?? 'gitlab.com'
  const id = ForgeId('gitlab')

  return {
    id,
    displayName: 'GitLab',
    domain,

    capabilities(): ForgeCapabilities {
      return {
        pullRequests: true,
        issues: true,
        forks: true,
        branches: true,
        codeSearch: true,
        webhooks: true,
      }
    },

    async status(): Promise<ForgeStatus> {
      return {
        state: 'ready',
        authenticated: false,
        detail: 'GitLab forge provider registered on host (offline mode)',
      }
    },
  }
}

/**
 * Apply the GitLab repository subplugin to the Cordis context.
 * Registers the GitLab forge provider on `ctx.repositories`.
 * @param ctx - Cordis context.
 * @param config - Optional configuration.
 * @returns Disposer function to unregister the forge.
 */
export function apply(ctx: Context, config: RepositoryGitlabConfig = {}): () => void {
  const forge = createGitlabForgeProvider(config)
  return ctx.repositories.registerForge(forge)
}
