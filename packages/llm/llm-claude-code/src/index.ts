/**
 * Register {@link ClaudeCodeAuthService} plus a {@link ClaudeCodeAdapter}
 * for the `claude-code-oauth` provider route on `ctx.llm`. The service owns
 * the Anthropic OAuth lifecycle (CLIProxyAPI import seed, browser PKCE
 * login, silent refresh) under `$DSH_HOME/claude-code-oauth.json`; the
 * adapter talks to Anthropic's `/v1/messages` endpoint with the Claude Code
 * client identity. Connection facts resolve per request, so a changed
 * endpoint or catalog reaches the very next request without restarting
 * anything. The one registration-captured fact — the retry policy —
 * re-registers the route in place when it changes.
 *
 * @module @deepseek-ai/dsh-llm-claude-code
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { ModelModality, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { ClaudeCodeAdapter, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, PROVIDER } from './adapter.ts'
import type { ClaudeCodeCatalogModel, ClaudeCodeConnectionOptions } from './adapter.ts'
import { ClaudeCodeAuthService } from './auth.ts'

export {
  ClaudeCodeAdapter,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  PROVIDER,
} from './adapter.ts'
export type { ClaudeCodeAdapterOptions, ClaudeCodeCatalogModel, ClaudeCodeConnectionOptions } from './adapter.ts'
export { ClaudeCodeAuthService, resolveAuthSpec } from './auth.ts'
export type { AuthSpec, AuthConfig, StoredCredential } from './auth.ts'
export type { RequestDefaults } from './serialize.ts'
export type * from './types.ts'

export const name = 'llm-claude-code'
export const inject = ['llm']

const NS = settingsNamespace('llm-claude-code')

/**
 * Advisory catalog defaults. Every value is what `api.anthropic.com` serves
 * this subscription over the OAuth path, measured per model rather than copied
 * from a vendor registry: the window comes from the `prompt is too long: N
 * tokens > LIMIT maximum` rejection and the output cap from the `max_tokens: N
 * > CAP` rejection.
 *
 * The 1M window is native to these four models, not an opt-in. They serve
 * 1,000,000 with `context-1m-2025-08-07` absent, and adding it changes no
 * outcome, which is why the adapter never sends that beta. On a model without
 * a native 1M window the same beta is actively harmful: Haiku 4.5 answers a
 * plain 200k request but rejects the beta with "The long context beta is not
 * yet available for this subscription."
 *
 * Sonnet 4.6 is deliberately left at the fallback window. It serves past its
 * nominal 200k, but input beyond roughly 220k is refused with "Usage credits
 * are required for long context requests," so the dependable subscription-only
 * capacity is 200k rather than that credit-dependent ceiling.
 */
const DEFAULT_MODELS: ClaudeCodeCatalogModel[] = [
  { id: 'claude-fable-5', name: 'Claude Fable 5 (subscription)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-opus-5', name: 'Claude Opus 5 (subscription)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (subscription)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (subscription)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (subscription)', maxTokens: 128_000 },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (subscription)', maxTokens: 64_000 },
]

const MODEL_MODALITIES = ['text', 'image'] as const satisfies readonly ModelModality[]

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-claude-code` settings-section shape.
 */
export interface Config {
  /** Anthropic API base (default `https://api.anthropic.com`). */
  apiBase?: string
  /** OAuth authorize endpoint override. */
  authorizeUrl?: string
  /** OAuth token endpoint override. */
  tokenUrl?: string
  /** Loopback port of the login control server (default 1458). */
  controlPort?: number
  /** Path of this plugin's credential document (default `$DSH_HOME/claude-code-oauth.json`). */
  path?: string
  /** CLIProxyAPI Claude auth file to import once at first boot (e.g. `~/.cli-proxy-api/claude-<email>.json`). */
  importFrom?: string
  /** Harness home override for the default credential path. */
  dshHome?: string
  /** Default per-request output cap (default 32,000); a model's own cap and explicit request values win. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 200,000). */
  defaultContextWindow?: number
  /** Advisory models; requests remain unrestricted. */
  models?: ClaudeCodeCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal mode with five retries. */
  retryPolicy?: RetryPolicyConfig
}

const catalogModel: z<ClaudeCodeCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  inputModalities: z.array(z.union(MODEL_MODALITIES)).min(1).default(['text']),
})

export const Config: z<Config> = z.object({
  apiBase: z.string(),
  authorizeUrl: z.string(),
  tokenUrl: z.string(),
  controlPort: z.natural(),
  path: z.string(),
  importFrom: z.string(),
  dshHome: z.string(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_TOKENS),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  models: z.array(catalogModel).default(DEFAULT_MODELS),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  retryPolicy: RetryPolicySchema,
})

/** One resolution's complete request facts. */
export interface ResolvedClaudeCodeOptions extends ClaudeCodeConnectionOptions {}

/** Validate and detach the advisory model catalog. */
function resolveModels(models: readonly ClaudeCodeCatalogModel[] | undefined): ClaudeCodeCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error('llm-claude-code: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-claude-code: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(`llm-claude-code: catalog model "${model.id}" contextWindow must be a positive integer`)
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(`llm-claude-code: catalog model "${model.id}" maxTokens must be a positive integer`)
    }
    const inputModalities = model.inputModalities ?? ['text']
    if (inputModalities.length === 0) {
      throw new Error(`llm-claude-code: catalog model "${model.id}" inputModalities must not be empty`)
    }
    if (inputModalities.some(modality => !MODEL_MODALITIES.includes(modality))) {
      throw new Error(
        `llm-claude-code: catalog model "${model.id}" inputModalities must contain only "text" and "image"`,
      )
    }
    if (new Set(inputModalities).size !== inputModalities.length) {
      throw new Error(`llm-claude-code: catalog model "${model.id}" inputModalities must not contain duplicates`)
    }
    if (seen.has(model.id)) throw new Error(`llm-claude-code: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      inputModalities: [...inputModalities],
    }
  })
}

/**
 * The one explicit resolve step from raw config to validated connection
 * facts, re-judging every default and bound for programmatic construction
 * that bypasses Schemastery normalization.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts.
 */
export function resolveAdapterOptions(config: Config): ResolvedClaudeCodeOptions {
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('llm-claude-code: maxTokens must be a positive safe integer')
  }
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-claude-code: defaultContextWindow must be a positive integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-claude-code: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const apiBase = config.apiBase ?? 'https://api.anthropic.com'
  return {
    baseURL: apiBase.replace(/\/+$/, ''),
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-claude-code: retryPolicy'),
  }
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedClaudeCodeOptions | undefined
  const options = (): ResolvedClaudeCodeOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveAdapterOptions(raw)
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      // Static composition resolves before anything registers, so this branch
      // only sees a live settings snapshot failing a beyond-schema bound:
      // keep serving the last good facts and say so once per bad snapshot.
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error('llm-claude-code: keeping the last good configuration after an invalid settings section')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  // The nested plugin fiber starts asynchronously from this sync apply, so
  // the first token resolution awaits its startup before reading the service.
  const authFiber = ctx.plugin(ClaudeCodeAuthService, config)
  const resolveAccessToken = async (): Promise<string | undefined> => {
    await authFiber
    const service = ctx.get('claudeCodeAuth') as ClaudeCodeAuthService | undefined
    if (service === undefined) {
      throw new Error('llm-claude-code: auth service is not mounted')
    }
    return service.bearerToken()
  }
  const adapter = new ClaudeCodeAdapter({
    options,
    resolveAccessToken,
  })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'Claude (subscription)', settingsNs: NS, settingsPath: [] },
  ])
  const registration = ctx.llm.registerAdapter([PROVIDER], adapter)
  let registeredPolicy = options().retryPolicy
  const ensureRegistrationFacts = (): void => {
    const policy = options().retryPolicy
    if (deepEqualJson(policy, registeredPolicy)) return
    registration.replace([PROVIDER])
    registeredPolicy = policy
  }

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })
}
