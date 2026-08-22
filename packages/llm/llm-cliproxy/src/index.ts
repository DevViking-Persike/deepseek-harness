/**
 * Register a {@link CliProxyAdapter} for the `cliproxy-claude` and
 * `cliproxy-openai` provider routes on `ctx.llm`, backed by one local
 * CLIProxyAPI instance (OpenAI-compatible `/v1/chat/completions` over the
 * operator's own CLI subscriptions). Connection facts resolve per request
 * instead of freezing at load: the plugin layers its `cordis.yml` entry
 * config under the optional `llm-cliproxy` user-settings section
 * (`ctx.settings`) and resolves the proxy API key through the credential seam
 * (`ctx.credentials`), so a changed endpoint, catalog, or key reaches the
 * very next request without restarting anything, while an in-flight stream
 * keeps the facts it started with. The one registration-captured fact — the
 * retry policy — re-registers the routes in place when it changes.
 *
 * @module @deepseek-ai/dsh-llm-cliproxy
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { assertUsableApiKey, LlmError, resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { ModelModality, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  CliProxyAdapter,
} from './adapter.ts'
import type { CliProxyCatalogModel, CliProxyConnectionOptions } from './adapter.ts'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  CliProxyAdapter,
} from './adapter.ts'
export type {
  CliProxyAdapterOptions,
  CliProxyCatalogModel,
  CliProxyConnectionOptions,
  CliProxyRoute,
} from './adapter.ts'
export type { RequestDefaults } from './serialize.ts'
export type * from './types.ts'

export const name = 'llm-cliproxy'
export const inject = ['llm']

const NS = settingsNamespace('llm-cliproxy')
const DEFAULT_API_KEY_ENV = 'CLIPROXY_API_KEY'
/** Both provider routes this plugin owns. */
const PROVIDERS = ['cliproxy-claude', 'cliproxy-openai'] as const

const DEFAULT_CLAUDE_MODELS: CliProxyCatalogModel[] = [
  { id: 'claude-fable-5', name: 'Claude Fable 5 (CLIProxyAPI)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-opus-5', name: 'Claude Opus 5 (CLIProxyAPI)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (CLIProxyAPI)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8 (CLIProxyAPI)', contextWindow: 1_000_000, maxTokens: 128_000 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (CLIProxyAPI)', contextWindow: 200_000, maxTokens: 128_000 },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (CLIProxyAPI)', contextWindow: 200_000, maxTokens: 64_000 },
]

const DEFAULT_OPENAI_MODELS: CliProxyCatalogModel[] = [
  { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol (CLIProxyAPI)', contextWindow: 400_000, maxTokens: 128_000 },
  { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna (CLIProxyAPI)', contextWindow: 400_000, maxTokens: 128_000 },
  { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra (CLIProxyAPI)', contextWindow: 400_000, maxTokens: 128_000 },
  { id: 'gpt-5.5', name: 'GPT-5.5 (CLIProxyAPI)', contextWindow: 400_000, maxTokens: 128_000 },
  { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark (CLIProxyAPI)', contextWindow: 400_000, maxTokens: 128_000 },
]

const MODEL_MODALITIES = ['text', 'image'] as const satisfies readonly ModelModality[]

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `llm-cliproxy` settings-section shape. Every field is optional in
 * yml: a missing API key resolves through {@link Config.apiKeyEnv} at each
 * request (a request without any key fails with `MISSING_CREDENTIAL`, not at
 * plugin load).
 */
export interface Config {
  /** Credential reference (environment-variable name) resolved per request; defaults to `CLIPROXY_API_KEY`. */
  apiKeyEnv?: string
  /** Endpoint base including the `/v1` prefix (default `http://127.0.0.1:8317/v1`). */
  baseURL?: string
  /** Default per-request output cap (default 32,000); a model's own cap and explicit request values win. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 200,000). */
  defaultContextWindow?: number
  /** Advisory models for the `cliproxy-claude` route; requests remain unrestricted. */
  claudeModels?: CliProxyCatalogModel[]
  /** Advisory models for the `cliproxy-openai` route; requests remain unrestricted. */
  openaiModels?: CliProxyCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal mode with five retries. */
  retryPolicy?: RetryPolicyConfig
}

const catalogModel: z<CliProxyCatalogModel> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  inputModalities: z.array(z.union(MODEL_MODALITIES)).min(1).default(['text']),
})

export const Config: z<Config> = z.object({
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_TOKENS),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  claudeModels: z.array(catalogModel).default(DEFAULT_CLAUDE_MODELS),
  openaiModels: z.array(catalogModel).default(DEFAULT_OPENAI_MODELS),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  retryPolicy: RetryPolicySchema,
})

/** Default endpoint: a same-host CLIProxyAPI service on its standard port. */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'

/** One resolution's complete request facts plus the derived route table. */
export interface ResolvedCliProxyOptions extends CliProxyConnectionOptions {
  /** Provider routes derived from this resolution's catalogs. */
  routes: readonly {
    provider: (typeof PROVIDERS)[number]
    displayName: string
    models: CliProxyCatalogModel[]
  }[]
}

/** Validate and detach one advisory model catalog under its route label. */
function resolveModels(label: string, models: readonly CliProxyCatalogModel[] | undefined): CliProxyCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? []).map((model) => {
    if (model.id.length === 0) throw new Error(`llm-cliproxy: ${label} catalog model ids must be non-empty`)
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`llm-cliproxy: ${label} catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(`llm-cliproxy: ${label} catalog model "${model.id}" contextWindow must be a positive integer`)
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(`llm-cliproxy: ${label} catalog model "${model.id}" maxTokens must be a positive integer`)
    }
    const inputModalities = model.inputModalities ?? ['text']
    if (inputModalities.length === 0) {
      throw new Error(`llm-cliproxy: ${label} catalog model "${model.id}" inputModalities must not be empty`)
    }
    if (inputModalities.some(modality => !MODEL_MODALITIES.includes(modality))) {
      throw new Error(
        `llm-cliproxy: ${label} catalog model "${model.id}" inputModalities must contain only "text" and "image"`,
      )
    }
    if (new Set(inputModalities).size !== inputModalities.length) {
      throw new Error(`llm-cliproxy: ${label} catalog model "${model.id}" inputModalities must not contain duplicates`)
    }
    if (seen.has(model.id)) throw new Error(`llm-cliproxy: duplicate ${label} catalog model "${model.id}"`)
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
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here — for the composition entry at
 * load (fail loud) and for each settings snapshot at its first use.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts plus the derived route table.
 */
export function resolveAdapterOptions(config: Config): ResolvedCliProxyOptions {
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('llm-cliproxy: maxTokens must be a positive safe integer')
  }
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('llm-cliproxy: defaultContextWindow must be a positive integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `llm-cliproxy: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  return {
    apiKeyEnv: credentialRef(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV),
    baseURL: config.baseURL ?? DEFAULT_BASE_URL,
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'llm-cliproxy: retryPolicy'),
    routes: [
      {
        provider: 'cliproxy-claude' as const,
        displayName: 'CLIProxyAPI · Claude',
        models: resolveModels('claude', config.claudeModels ?? DEFAULT_CLAUDE_MODELS),
      },
      {
        provider: 'cliproxy-openai' as const,
        displayName: 'CLIProxyAPI · OpenAI',
        models: resolveModels('openai', config.openaiModels ?? DEFAULT_OPENAI_MODELS),
      },
    ],
  }
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: ResolvedCliProxyOptions | undefined
  const options = (): ResolvedCliProxyOptions => {
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
      ctx.logger.error('llm-cliproxy: keeping the last good configuration after an invalid settings section')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  const resolveApiKey = async (connection: CliProxyConnectionOptions): Promise<string> => {
    // Every credential fact comes from the caller's snapshot, so a rejected
    // settings generation cannot leak its key onto the previous endpoint.
    const ref = connection.apiKeyEnv
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, 'llm-cliproxy', ref)
    } else {
      // Without the seam there is no managed store to rank against, so the
      // environment is the whole credential plane.
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, 'llm-cliproxy', ref)
      }
    }
    throw new LlmError(
      `llm-cliproxy: no API key for provider routes [${PROVIDERS.join(', ')}]; store ${ref} through the`
      + ` credentials service (the web Models page writes it), or export ${ref} in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }

  const adapter = new CliProxyAdapter({ options, resolveApiKey, routes: options().routes })
  ctx.llm.registerConfigurableProviders([
    { provider: 'cliproxy-claude', displayName: 'CLIProxyAPI · Claude', settingsNs: NS, settingsPath: [] },
    { provider: 'cliproxy-openai', displayName: 'CLIProxyAPI · OpenAI', settingsNs: NS, settingsPath: [] },
  ])
  // Route effects bind to this apply fiber via the stable `ctx` reference,
  // even when a swap runs inside the scoped settings callback below.
  const registration = ctx.llm.registerAdapter([...PROVIDERS], adapter)
  let registeredPolicy = options().retryPolicy
  const ensureRegistrationFacts = (): void => {
    const policy = options().retryPolicy
    if (deepEqualJson(policy, registeredPolicy)) return
    // The registry captures the retry policy at registration, so it is the one
    // fact per-request resolution cannot refresh. `replace` re-reads it in one
    // synchronous registry section.
    registration.replace([...PROVIDERS])
    registeredPolicy = policy
  }

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })
}
