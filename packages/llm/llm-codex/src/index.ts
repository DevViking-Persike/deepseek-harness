/**
 * Register {@link CodexAuthService} plus a {@link CodexAdapter} for the
 * `codex-oauth` provider route on `ctx.llm`. The service owns the OpenAI
 * OAuth lifecycle (CLIProxyAPI import seed, browser PKCE login, silent
 * refresh, subscription usage) under `$DSH_HOME/codex-oauth.json`; the
 * adapter talks to the ChatGPT backend Codex Responses endpoint with the
 * Codex CLI identity. Connection facts resolve per request, so a changed
 * endpoint or catalog reaches the very next request without restarting
 * anything. The one registration-captured fact — the retry policy —
 * re-registers the route in place when it changes.
 *
 * @module @deepseek-ai/dsh-llm-codex
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { ModelModality, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import { CodexAdapter, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS, DEFAULT_STREAM_IDLE_TIMEOUT_MS, PROVIDER } from './adapter.ts'
import type { CodexCatalogModel, CodexConnectionOptions } from './adapter.ts'
import { CodexAuthService } from './auth.ts'

export {
  CodexAdapter,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  PROVIDER,
} from './adapter.ts'
export type { CodexAdapterOptions, CodexCatalogModel, CodexConnectionOptions } from './adapter.ts'
export { CodexAuthService, extractAccountId, normalizeUsage, resolveAuthSpec } from './auth.ts'
export type { AuthConfig, AuthSpec, CodexUsage, StoredCredential } from './auth.ts'
export type { RequestDefaults } from './serialize.ts'
export type * from './types.ts'

export const name = 'llm-codex'
export const inject = ['llm']

const NS = settingsNamespace('llm-codex')

const DEFAULT_MODELS: CodexCatalogModel[] = [
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol (subscription)' },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna Fast (subscription)', serviceTier: 'priority' },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra (subscription)' },
  { id: 'gpt-5.5', name: 'GPT-5.5 (subscription)' },
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark (subscription)' },
]

const MODEL_MODALITIES = ['text', 'image'] as const satisfies readonly ModelModality[]

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-codex` settings-section shape.
 */
export interface Config {
  /** ChatGPT backend API base (default `https://chatgpt.com/backend-api`). */
  backendBase?: string
  /** Subscription usage endpoint override. */
  usageUrl?: string
  /** OAuth authorize endpoint override. */
  authorizeUrl?: string
  /** OAuth token endpoint override. */
  tokenUrl?: string
  /** Loopback port of the login control server (default 1456). */
  controlPort?: number
  /** Path of this plugin's credential document (default `$DSH_HOME/codex-oauth.json`). */
  path?: string
  /** CLIProxyAPI Codex auth file to import once at first boot (e.g. `~/.cli-proxy-api/codex-*.json`). */
  importFrom?: string
  /** Harness home override for the default credential path. */
  dshHome?: string
  /** Default per-request output cap (default 128,000); a model's own cap and explicit request values win. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 400,000). */
  defaultContextWindow?: number
  /** Advisory models; requests remain unrestricted. */
  models?: CodexCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal mode with five retries. */
  retryPolicy?: RetryPolicyConfig
}

const catalogModel: z<CodexCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  inputModalities: z.array(z.union(MODEL_MODALITIES)).min(1).default(['text']),
  serviceTier: z.string(),
})

export const Config: z<Config> = z.object({
  backendBase: z.string(),
  usageUrl: z.string(),
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
export interface ResolvedCodexOptions extends CodexConnectionOptions {}

/** Validate and detach the advisory model catalog. */
function resolveModels(models: readonly CodexCatalogModel[] | undefined): CodexCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error('llm-codex: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-codex: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(`llm-codex: catalog model "${model.id}" contextWindow must be a positive integer`)
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(`llm-codex: catalog model "${model.id}" maxTokens must be a positive integer`)
    }
    if (model.serviceTier !== undefined && model.serviceTier.length === 0) {
      throw new Error(`llm-codex: catalog model "${model.id}" serviceTier must be non-empty when set`)
    }
    const inputModalities = model.inputModalities ?? ['text']
    if (inputModalities.length === 0) {
      throw new Error(`llm-codex: catalog model "${model.id}" inputModalities must not be empty`)
    }
    if (inputModalities.some(modality => !MODEL_MODALITIES.includes(modality))) {
      throw new Error(
        `llm-codex: catalog model "${model.id}" inputModalities must contain only "text" and "image"`,
      )
    }
    if (new Set(inputModalities).size !== inputModalities.length) {
      throw new Error(`llm-codex: catalog model "${model.id}" inputModalities must not contain duplicates`)
    }
    if (seen.has(model.id)) throw new Error(`llm-codex: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      inputModalities: [...inputModalities],
      ...model.serviceTier === undefined ? {} : { serviceTier: model.serviceTier },
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
export function resolveAdapterOptions(config: Config): ResolvedCodexOptions {
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('llm-codex: maxTokens must be a positive safe integer')
  }
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-codex: defaultContextWindow must be a positive integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-codex: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return {
    baseURL: (config.backendBase ?? 'https://chatgpt.com/backend-api').replace(/\/+$/, ''),
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-codex: retryPolicy'),
  }
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedCodexOptions | undefined
  const options = (): ResolvedCodexOptions => {
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
      ctx.logger.error('llm-codex: keeping the last good configuration after an invalid settings section')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  // The nested plugin fiber starts asynchronously from this sync apply, so
  // the first token resolution awaits its startup before reading the service.
  const authFiber = ctx.plugin(CodexAuthService, config)
  const resolveAccess = async (): Promise<{ accessToken: string; accountId: string } | undefined> => {
    await authFiber
    const service = ctx.get('codexAuth') as CodexAuthService | undefined
    if (service === undefined) {
      throw new Error('llm-codex: auth service is not mounted')
    }
    return service.access()
  }
  const adapter = new CodexAdapter({
    options,
    resolveAccess,
  })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'Codex (subscription)', settingsNs: NS, settingsPath: [] },
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
