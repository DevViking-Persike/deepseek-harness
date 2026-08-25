/**
 * Model-facing Git tools over `ctx.git`: `git_status`, `git_diff`, `git_log`,
 * and the opt-in `git_stage`, `git_unstage`, `git_discard`, `git_commit`. This
 * package owns schemas, validation, prompt guidance, limits, and presentation,
 * never concrete backends. Enablement controls tool registration; an enabled
 * tool stays visible when no Git backend is usable and fails with a structured
 * error at execution time.
 * @module @deepseek-ai/dsh-tool-git
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-git'
import { applyGitInspectTools } from './inspect.ts'
import { applyGitMutateTools } from './mutate.ts'

export { applyGitInspectTools, capDiff, changeRow, formatStatus, requireRepository } from './inspect.ts'
export { applyGitMutateTools } from './mutate.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-git'

/** Services required by the Git tool suite. */
export const inject = ['tools', 'git', 'systemPrompt']

/** Plugin config: which Git tools to register, their budgets, and output caps. */
export interface Config {
  /** Register the read-only `git_status` / `git_diff` / `git_log` tools. Defaults to true. */
  inspect?: boolean
  /**
   * Register the state-changing `git_stage` / `git_unstage` / `git_discard` /
   * `git_commit` tools. Defaults to false: `git_discard` destroys uncommitted
   * work and `git_commit` writes history, and a read-only Git view is useful
   * without either.
   */
  mutate?: boolean
  /** Cooperative timeout budget (ms) for one read-only call. */
  inspectTimeoutMs?: number
  /** Cooperative timeout budget (ms) for one mutating call; hooks run here. */
  mutateTimeoutMs?: number
  /** Cap on characters one `git_diff` call emits per side. */
  maxDiffChars?: number
}

export const Config: z<Config> = z.object({
  inspect: z.boolean().default(true),
  mutate: z.boolean().default(false),
  inspectTimeoutMs: z.number().default(30_000),
  mutateTimeoutMs: z.number().default(120_000),
  maxDiffChars: z.number().default(40_000),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/** Every positive-integer config field, validated together at load. */
const POSITIVE_FIELDS = [
  'inspectTimeoutMs',
  'mutateTimeoutMs',
  'maxDiffChars',
] as const satisfies readonly (keyof Config)[]

/**
 * Register the configured Git tools.
 * @param ctx - Cordis context carrying the tools, git, and systemPrompt services.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: ResolvedConfig): void {
  for (const field of POSITIVE_FIELDS) {
    const value = config[field]
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`tool-git: ${field} must be a positive integer`)
    }
  }
  if (config.inspect) applyGitInspectTools(ctx, config.inspectTimeoutMs, config.maxDiffChars)
  if (config.mutate) applyGitMutateTools(ctx, config.mutateTimeoutMs)
}
