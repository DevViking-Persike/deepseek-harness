/**
 * `ClaudeCodeAdapter`: fetch + SSE against Anthropic's `/v1/messages`
 * endpoint over a Claude subscription OAuth token, emitting harness
 * StreamChunks. The adapter is transport-only: connection facts arrive
 * through a thunk resolved once per operation and the bearer token through
 * the owning auth service, so credentials refresh without re-registration.
 *
 * @module dsh-llm-claude-code/adapter
 */

import {
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  QUOTA_EXCEEDED_CODE,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ModelModality,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { serializeRequest } from './serialize.ts'
import type { RequestDefaults } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'
import type { WireError } from './types.ts'

/** One optional model entry advertised by the adapter. */
export interface ClaudeCodeCatalogModel {
  /** Wire model id accepted by the subscription. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when unknown. */
  contextWindow?: number
  /** Per-request output cap for this model; omission falls back to the connection default. */
  maxTokens?: number
  /** Accepted request modalities; omission is text-only. */
  inputModalities?: ModelModality[]
}

/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation.
 */
export interface ClaudeCodeConnectionOptions {
  /** Anthropic API base; `/v1/messages` is appended. */
  baseURL: string
  /** Default per-request output cap; explicit request values win. */
  maxTokens: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly ClaudeCodeCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link ClaudeCodeAdapter}. */
export interface ClaudeCodeAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => ClaudeCodeConnectionOptions
  /**
   * Resolve the OAuth bearer token for one request; `undefined` means no
   * subscription is connected and the request fails with `MISSING_CREDENTIAL`.
   */
  resolveAccessToken: () => Promise<string | undefined>
}

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default combined request/response context capacity. */
export const DEFAULT_CONTEXT_WINDOW = 200_000
/** Default per-request output-token cap. */
export const DEFAULT_MAX_TOKENS = 32_000
/** The single provider route this adapter owns. */
export const PROVIDER = 'claude-code-oauth'

const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
/**
 * The Anthropic-Beta baseline Claude Code 2.1.220 sends on every OAuth
 * request, in wire order: the Claude Code feature flag, the OAuth credential
 * flag, and the constant capability trailers (thinking, context management,
 * caching, effort, fallback credit, extended cache TTL).
 *
 * `context-1m-2025-08-07` is deliberately absent. The models that serve a 1M
 * window on this endpoint do so natively — measured identically with and
 * without the beta — while models without that window reject the beta itself
 * ("The long context beta is not yet available for this subscription") even
 * when they would answer the same request without it. Sending it unconditionally
 * would therefore buy no capacity and break the models it does not fit.
 */
const OAUTH_BETAS = [
  'claude-code-20250219',
  'oauth-2025-04-20',
  'interleaved-thinking-2025-05-14',
  'redact-thinking-2026-02-12',
  'thinking-token-count-2026-05-13',
  'context-management-2025-06-27',
  'prompt-caching-scope-2026-01-05',
  'effort-2025-11-24',
  'fallback-credit-2026-06-01',
  'extended-cache-ttl-2025-04-11',
].join(',')

function modelInfo(provider: string, model: ClaudeCodeCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    ...model.description === undefined ? {} : { description: model.description },
    inputModalities: model.inputModalities ?? ['text'],
  }
}

function providerRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000
    return Number.isFinite(delay) && delay > 0 ? delay : undefined
  }
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

/**
 * Map an HTTP status to a stable LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param error - parsed provider error body, when available.
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, error?: WireError['error']): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 413) return 'INVALID_REQUEST'
  const detail = [error?.type, error?.message].filter(Boolean).join(' ')
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status === 529) return 'SERVER'
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}

/**
 * One adapter serving the `claude-code-oauth` provider route. The harness
 * model name IS the wire model name.
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class ClaudeCodeAdapter extends LlmAdapter {
  constructor(private readonly config: ClaudeCodeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Claude (subscription)' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(this.config.options().models.map(model => modelInfo(provider, model)))
  }

  override resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    const configured = connection.models.find(entry => entry.id === model)
    const contextWindow = configured?.contextWindow ?? connection.defaultContextWindow
    return Promise.resolve({
      // An uncatalogued endpoint is safely treated as text-only. Declaring an
      // unverified image capability would let the host persist input that the
      // endpoint may reject on every later turn.
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.maxTokens,
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const connection = this.config.options()
    const accessToken = await this.config.resolveAccessToken()
    if (accessToken === undefined) {
      throw new LlmError(
        'Claude subscription is not connected; open the control /start endpoint to log in',
        'MISSING_CREDENTIAL',
      )
    }
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(options, watchdog.signal, connection, accessToken, () => {
      watchdog.pulse()
    })[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `Claude stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('Claude request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Claude stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('Claude stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination; a return-time abort cannot add a second outcome.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: ClaudeCodeConnectionOptions,
    accessToken: string,
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const defaults: RequestDefaults = { maxTokens: connection.maxTokens }
    const body = serializeRequest(options, defaults)
    // Prepared outside the try so the TRANSPORT label below covers exactly the
    // transport boundary, never a serialization failure.
    const payload = JSON.stringify(body)
    const headers: Record<string, string> = {
      ...attributionHeaders(),
      'authorization': `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': OAUTH_BETAS,
      'x-app': 'cli',
      // The subscription endpoint gates on the Claude Code client identity;
      // this overrides the harness attribution user-agent above on purpose.
      'user-agent': 'claude-cli/2.1.220 (external, sdk-cli)',
    }

    let response: Response
    try {
      response = await fetch(`${connection.baseURL}/v1/messages`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      throw new LlmError(
        `Claude request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `Claude API error (HTTP ${response.status})`
      let providerError: WireError['error']
      try {
        const parsed = await response.json() as WireError
        providerError = parsed.error
        if (providerError?.message) message = providerError.message
      } catch {
        // Only swallow error-body parsing: the HTTP status still identifies the
        // failure, so malformed gateway JSON must not mask it.
      }
      const delay = providerRetryAfterMs(response.headers.get('retry-after'))
      throw new LlmError(message, httpErrorCode(response.status, providerError), {
        status: response.status,
        ...delay === undefined ? {} : { providerRetryAfterMs: delay },
      })
    }
    if (!response.body) {
      throw new LlmError('Claude API returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body, onComment))
  }
}
