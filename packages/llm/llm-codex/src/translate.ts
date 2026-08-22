/**
 * Translate Codex backend Responses SSE events into harness StreamChunks
 * with one stateful block per streamed output item, keyed by the wire
 * `output_index`. Blocks open on `response.output_item.added` and close at
 * the terminal event. Usage and the finish reason are deferred until then,
 * covering the protocol rule that nothing follows `finish`.
 *
 * @module dsh-llm-codex/translate
 */

import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { WireEvent, WireUsage } from './types.ts'

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  /** tool-call only */
  callId?: string
  name?: string
}

/** The mapped outcome of a terminal event. */
interface Terminal {
  reason: FinishReason
  usage: TokenUsage | undefined
}

/**
 * Map wire usage fields to the harness `TokenUsage` convention of disjoint
 * counts: cache hits reported inside `input_tokens` are subtracted out of
 * `inputTokens`.
 * @param usage - wire usage from the terminal event.
 * @returns disjoint harness counts; optional fields present only when the wire reported them.
 */
export function mapUsage(usage: WireUsage): TokenUsage {
  const cacheRead = usage.input_tokens_details?.cached_tokens
  const reasoning = usage.output_tokens_details?.reasoning_tokens
  return {
    inputTokens: (usage.input_tokens ?? 0) - (cacheRead ?? 0),
    outputTokens: usage.output_tokens ?? 0,
    ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
  }
}

/**
 * Derive the harness FinishReason from the terminal event and the blocks it
 * assembled: any streamed function call makes a tool-calls finish;
 * `response.incomplete` is a max-tokens finish.
 * @param event - the terminal event.
 * @param order - every block opened before the terminal event.
 * @returns the finish reason and mapped usage.
 */
export function mapTerminal(event: WireEvent, order: readonly OpenBlock[]): Terminal {
  if (event.type === 'response.failed') {
    const failure = event.response.error
    return {
      reason: {
        kind: 'error',
        failure: {
          message: failure?.message ?? 'model response failed',
          code: failure?.code ?? 'RESPONSE_FAILED',
        },
      },
      usage: undefined,
    }
  }
  const usage = event.type === 'response.completed' || event.type === 'response.incomplete'
    ? event.response.usage
    : undefined
  if (event.type === 'response.incomplete') {
    return { reason: { kind: 'max-tokens' }, usage: usage === undefined ? undefined : mapUsage(usage) }
  }
  const hasToolCalls = order.some(block => block.kind === 'tool-call')
  return {
    reason: hasToolCalls ? { kind: 'tool-calls' } : { kind: 'stop' },
    usage: usage === undefined ? undefined : mapUsage(usage),
  }
}

/** Assemble the final ContentBlock for one open block. */
function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: CallId(block.callId ?? ''),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}

/**
 * Consume parsed SSE events (ending with a terminal event) and yield
 * StreamChunks.
 * @param events - parsed events from {@link parseSse}, terminal-terminated.
 * @returns block lifecycle chunks and deltas as they arrive; `block-end`s,
 *   `usage`, and `finish` are deferred to the terminal event. A `stop` finish
 *   with no opened blocks maps to an `EMPTY_RESPONSE` error finish.
 */
export async function* translate(events: AsyncIterable<WireEvent>): AsyncGenerator<StreamChunk> {
  const byOutputIndex = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let nextIndex = 0

  for await (const event of events) {
    switch (event.type) {
      case 'response.output_item.added': {
        const wire = event.item
        const kind = wire.type === 'reasoning'
          ? 'reasoning'
          : wire.type === 'function_call'
            ? 'tool-call'
            : 'text'
        const block: OpenBlock = {
          index: nextIndex++,
          kind,
          text: '',
          ...wire.call_id !== undefined ? { callId: wire.call_id } : {},
          ...wire.name !== undefined ? { name: wire.name } : {},
        }
        byOutputIndex.set(event.output_index, block)
        order.push(block)
        yield { type: 'block-start', index: block.index, blockType: kind }
        break
      }
      case 'response.output_text.delta': {
        const block = byOutputIndex.get(event.output_index)
        if (block === undefined || block.kind !== 'text') break
        block.text += event.delta
        yield { type: 'text-delta', index: block.index, text: event.delta }
        break
      }
      case 'response.reasoning_summary_text.delta': {
        const block = byOutputIndex.get(event.output_index)
        if (block === undefined || block.kind !== 'reasoning') break
        block.text += event.delta
        yield { type: 'reasoning-delta', index: block.index, text: event.delta }
        break
      }
      case 'response.function_call_arguments.delta': {
        const block = byOutputIndex.get(event.output_index)
        if (block === undefined || block.kind !== 'tool-call') break
        block.text += event.delta
        yield {
          type: 'tool-call-delta',
          index: block.index,
          id: CallId(block.callId ?? ''),
          ...block.name !== undefined ? { name: block.name } : {},
          argumentsDelta: event.delta,
        }
        break
      }
      case 'response.completed':
      case 'response.incomplete':
      case 'response.failed': {
        const { reason, usage } = mapTerminal(event, order)
        for (const block of order) {
          yield { type: 'block-end', index: block.index, block: closeBlock(block) }
        }
        if (usage !== undefined) yield { type: 'usage', usage }
        yield {
          type: 'finish',
          reason: reason.kind === 'stop' && order.length === 0
            ? {
              kind: 'error',
              failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
            }
            : reason,
        }
        return
      }
      case 'error': {
        throw new LlmError(
          typeof event.message === 'string' ? event.message : 'provider streamed an error event',
          typeof event.code === 'string' ? event.code : 'PROVIDER_ERROR',
        )
      }
      default:
        // response.created, content_part, *.done, and future event types
        // carry no block-opening or delta payload this translator needs.
        break
    }
  }

  // parseSse guarantees a terminal event (or throws); reaching here means
  // the event source violated that contract.
  throw new LlmError('SSE event stream ended without a terminal response event', 'STREAM_CLOSED')
}
