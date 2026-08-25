/**
 * GitHub code forge subplugin for the repository capability seam (`ctx.repositories`).
 * Registers GitHub forge identity, capabilities, and connection status on the host.
 * @module @deepseek-ai/dsh-repository-github
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
export const name = 'repository-github'

/** Required service injections. */
export const inject = ['repositories']

/**
 * Configuration options for the GitHub forge subplugin.
 */
export interface RepositoryGithubConfig {
  /** Custom domain for GitHub Enterprise installations (defaults to 'github.com'). */
  readonly domain?: string
}

/** Schemastery configuration schema. */
export const Config: z<RepositoryGithubConfig> = z.object({
  domain: z.string(),
}) as z<RepositoryGithubConfig>

/**
 * Create a GitHub forge provider instance.
 * @param config - Configuration options.
 * @returns Configured ForgeProvider instance for GitHub.
 */
export function createGithubForgeProvider(config: RepositoryGithubConfig = {}): ForgeProvider {
  const domain = config.domain ?? 'github.com'
  const id = ForgeId('github')

  return {
    id,
    displayName: 'GitHub',
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
        detail: 'GitHub forge provider registered on host (offline mode)',
      }
    },
  }
}

/**
 * Apply the GitHub repository subplugin to the Cordis context.
 * Registers the GitHub forge provider on `ctx.repositories`.
 * @param ctx - Cordis context.
 * @param config - Optional configuration.
 * @returns Disposer function to unregister the forge.
 */
export function apply(ctx: Context, config: RepositoryGithubConfig = {}): () => void {
  const forge = createGithubForgeProvider(config)
  return ctx.repositories.registerForge(forge)
}
