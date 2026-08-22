/**
 * `CodexAdapter`: fetch + SSE against the ChatGPT backend Codex Responses
 * endpoint over a Codex subscription OAuth token, emitting harness
 * StreamChunks. The adapter is transport-only: connection facts arrive
 * through a thunk resolved once per operation and the bearer token plus
 * account id through the owning auth service, so credentials refresh
 * without re-registration.
 *
 * @module dsh-llm-codex/adapter
 */

import {
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  QUOTA_EXCEEDED_CODE,
  ReasoningEffortId,
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
export interface CodexCatalogModel {
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
  /** Priority serving tier this model requests (e.g. `priority` for tiered variants); omission sends none. */
  serviceTier?: string
}

/**
 * Validated connection facts for one operation. The plugin's
 * `resolveAdapterOptions` is the one explicit resolve step producing this
 * shape; the adapter trusts it and re-reads it per operation.
 */
export interface CodexConnectionOptions {
  /** ChatGPT backend API base; `/codex/responses` is appended. */
  baseURL: string
  /** Default per-request output cap; explicit request values win. */
  maxTokens: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly CodexCatalogModel[]
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link CodexAdapter}. */
export interface CodexAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => CodexConnectionOptions
  /**
   * Resolve the OAuth bearer token and ChatGPT account id for one request;
   * a missing token rejects with `MISSING_CREDENTIAL`.
   */
  resolveAccess: () => Promise<{ accessToken: string; accountId: string } | undefined>
}

/** Default maximum idle interval while an adapter stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
/** Default combined request/response context capacity. */
export const DEFAULT_CONTEXT_WINDOW = 400_000
/** Default per-request output-token cap. */
export const DEFAULT_MAX_TOKENS = 128_000
/** The single provider route this adapter owns. */
export const PROVIDER = 'codex-oauth'

const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
/**
 * The Codex CLI identity the backend gates on: the experimental Responses
 * flag plus the terminal client's originator and user agent.
 */
const ORIGINATOR = 'codex-tui'
const USER_AGENT = 'codex-tui/0.146.0 (Mac OS 26.5.0; arm64) iTerm.app/3.6.10 (codex-tui; 0.146.0)'

const LOW_EFFORT = ReasoningEffortId('low')
const MEDIUM_EFFORT = ReasoningEffortId('medium')
const HIGH_EFFORT = ReasoningEffortId('high')
const MAX_EFFORT = ReasoningEffortId('max')
const REASONING_EFFORTS = [
  { id: LOW_EFFORT, name: 'Low' },
  { id: MEDIUM_EFFORT, name: 'Medium' },
  { id: HIGH_EFFORT, name: 'High' },
  { id: MAX_EFFORT, name: 'Max (xhigh)' },
] as const

function modelInfo(provider: string, model: CodexCatalogModel): LlmModelInfo {
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
  const detail = [error?.code, error?.type, error?.message].filter(Boolean).join(' ')
  if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
  if (status === 429) return 'RATE_LIMIT'
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  return `HTTP_${status}`
}

/**
 * One adapter serving the `codex-oauth` provider route. The harness model
 * name IS the wire model name.
 *
 * One stable signal reaches both initial fetch and body reads. Caller aborts
 * map to `ABORTED`; the configured per-read idle watchdog maps to `TIMEOUT`.
 */
export class CodexAdapter extends LlmAdapter {
  constructor(private readonly config: CodexAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Codex (subscription)' }
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
      reasoning: { efforts: REASONING_EFFORTS, defaultEffort: HIGH_EFFORT },
    })
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const connection = this.config.options()
    const access = await this.config.resolveAccess()
    if (access === undefined) {
      throw new LlmError(
        'Codex subscription is not connected; open the control /start endpoint to log in',
        'MISSING_CREDENTIAL',
      )
    }
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(options, watchdog.signal, connection, access, () => {
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
          `Codex stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('Codex request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Codex stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('Codex stream consumer stopped')
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
    connection: CodexConnectionOptions,
    access: { accessToken: string; accountId: string },
    onComment: () => void,
  ): AsyncIterable<StreamChunk> {
    const configured = connection.models.find(entry => entry.id === options.model)
    const defaults: RequestDefaults = {
      ...configured?.serviceTier !== undefined ? { serviceTier: configured.serviceTier } : {},
    }
    const body = serializeRequest(options, defaults)
    // Prepared outside the try so the TRANSPORT label below covers exactly the
    // transport boundary, never a serialization failure.
    const payload = JSON.stringify(body)
    const headers: Record<string, string> = {
      ...attributionHeaders(),
      'authorization': `Bearer ${access.accessToken}`,
      'content-type': 'application/json',
      'accept': 'text/event-stream',
      'openai-beta': 'responses=experimental',
      'originator': ORIGINATOR,
      // The backend gates on the Codex terminal client identity; this
      // overrides the harness attribution user-agent above on purpose.
      'user-agent': USER_AGENT,
      'connection': 'Keep-Alive',
      ...access.accountId.length > 0 ? { 'chatgpt-account-id': access.accountId } : {},
    }

    let response: Response
    try {
      response = await fetch(`${connection.baseURL}/codex/responses`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      })
    } catch (error: unknown) {
      if (signal.aborted) throw error
      throw new LlmError(
        `Codex request to ${connection.baseURL} failed`,
        'TRANSPORT',
        { cause: error },
      )
    }

    if (!response.ok) {
      let message = `Codex backend error (HTTP ${response.status})`
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
      throw new LlmError('Codex backend returned no response body', 'EMPTY_RESPONSE')
    }

    yield* translate(parseSse(response.body, onComment))
  }
}
