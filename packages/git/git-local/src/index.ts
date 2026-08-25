/**
 * `@deepseek-ai/dsh-git-local`: registers the local `git` CLI backend with
 * `ctx.git`. A function/namespace plugin (NOT a default-export service): it
 * registers INTO the seam's provider registry.
 * @module @deepseek-ai/dsh-git-local
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-git'
import type {} from '@deepseek-ai/dsh-subprocess'
import { LocalGitProvider } from './provider.ts'
import type { LocalGitLimits } from './provider.ts'

export { LOCAL_GIT_PROVIDER_ID, LocalGitProvider, resolveInside } from './provider.ts'
export type { LocalGitLimits } from './provider.ts'
export { discoverRepositories } from './discover.ts'
export {
  parseBranches, parseDivergence, parseGraph, parseLog, parseNumstat, parseStatus, parseWorktrees,
} from './parse.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'git-local'

/** The Git seam this provider registers into, plus the process seam it runs on. */
export const inject = ['git', 'subprocess']

/** Plugin config: which CLI to run and the limits each invocation carries. */
export interface Config {
  /** Executable name or absolute path of the Git CLI. */
  cli?: string
  /** Cooperative timeout for one read (status, diff, log, discovery). */
  readTimeoutMs?: number
  /** Cooperative timeout for one mutation (stage, unstage, discard, commit). */
  writeTimeoutMs?: number
  /** Cap on collected output bytes of one invocation. */
  maxOutputBytes?: number
  /** Termination grace period handed to the subprocess seam. */
  graceMs?: number
  /** Largest number of changed paths one status reports before truncating. */
  maxChanges?: number
}

export const Config: z<Config> = z.object({
  cli: z.string().default('git'),
  readTimeoutMs: z.number().default(30_000),
  // A commit runs hooks the repository owns, which routinely outlast a read.
  writeTimeoutMs: z.number().default(120_000),
  maxOutputBytes: z.number().default(4_000_000),
  graceMs: z.number().default(5_000),
  maxChanges: z.number().default(2_000),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** Every positive-integer config field, validated together at load. */
const POSITIVE_FIELDS = [
  'readTimeoutMs',
  'writeTimeoutMs',
  'maxOutputBytes',
  'graceMs',
  'maxChanges',
] as const satisfies readonly (keyof Config)[]

/**
 * Register the local Git CLI provider. Misconfiguration fails at load; a
 * machine without `git` does not, because availability is a per-call fact the
 * seam probes during selection.
 * @param ctx - Cordis context carrying the git and subprocess seams.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  for (const field of POSITIVE_FIELDS) {
    const value = config[field]
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`git-local: ${field} must be a positive integer`)
    }
  }
  if (config.cli.length === 0) {
    throw new Error('git-local: cli must not be empty')
  }
  const limits: LocalGitLimits = {
    cli: config.cli,
    readTimeoutMs: config.readTimeoutMs,
    writeTimeoutMs: config.writeTimeoutMs,
    maxOutputBytes: config.maxOutputBytes,
    graceMs: config.graceMs,
    maxChanges: config.maxChanges,
  }
  ctx.effect(
    () => ctx.git.registerProvider(new LocalGitProvider(ctx, limits)),
    'git-local: provider registration',
  )
}
