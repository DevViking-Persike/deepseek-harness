/**
 * Translate Anthropic `/v1/messages` SSE events into harness StreamChunks
 * with one stateful block per wire content-block index. Blocks open on
 * `content_block_start` and close on their `content_block_stop`. Usage and
 * the finish reason are deferred until `message_stop`, covering both the
 * `message_start`/`message_delta` usage split and the protocol rule that
 * nothing follows `finish`.
 *
 * @module dsh-llm-claude-code/translate
 */

import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { WireDelta, WireEvent, WireUsage } from './types.ts'

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  /** tool-call only */
  callId?: string
  name?: string
}

/**
 * Map the wire `stop_reason` vocabulary to the harness FinishReason.
 * @param reason - the wire `stop_reason` string.
 * @returns the mapped reason; unrecognized values become `{kind: 'error'}` with the uppercased value as `code`.
 */
export function mapStopReason(reason: string): FinishReason {
  switch (reason) {
    case 'end_turn': return { kind: 'stop' }
    case 'stop_sequence': return { kind: 'stop' }
    case 'tool_use': return { kind: 'tool-calls' }
    case 'max_tokens': return { kind: 'max-tokens' }
    default:
      // refusal, content_filter, future additions.
      return {
        kind: 'error',
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
      }
  }
}

/**
 * Map wire usage fields to the harness `TokenUsage` convention. Anthropic's
 * `input_tokens` already excludes cache reads, so counts map disjointly
 * without subtraction.
 * @param usage - wire usage from `message_start` and/or `message_delta`.
 * @returns disjoint harness counts; optional fields present only when the wire reported them.
 */
export function mapUsage(usage: WireUsage): Partial<TokenUsage> {
  return {
    ...usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {},
    ...usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {},
    ...usage.cache_read_input_tokens !== undefined ? { cacheReadTokens: usage.cache_read_input_tokens } : {},
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

function deltaChunk(block: OpenBlock, delta: WireDelta): StreamChunk | undefined {
  switch (delta.type) {
    case 'text_delta':
      if (block.kind !== 'text') return undefined
      block.text += delta.text
      return { type: 'text-delta', index: block.index, text: delta.text }
    case 'thinking_delta':
      if (block.kind !== 'reasoning') return undefined
      block.text += delta.thinking
      return { type: 'reasoning-delta', index: block.index, text: delta.thinking }
    case 'input_json_delta':
      if (block.kind !== 'tool-call') return undefined
      block.text += delta.partial_json
      return {
        type: 'tool-call-delta',
        index: block.index,
        id: CallId(block.callId ?? ''),
        ...block.name !== undefined ? { name: block.name } : {},
        argumentsDelta: delta.partial_json,
      }
  }
}

/**
 * Consume parsed SSE events (ending with `message_stop`) and yield
 * StreamChunks.
 * @param events - parsed events from {@link parseSse}, `message_stop`-terminated.
 * @returns block lifecycle chunks and deltas as they arrive; `block-end`s,
 *   `usage`, and `finish` are deferred to `message_stop`. A `stop` finish
 *   with no opened blocks maps to an `EMPTY_RESPONSE` error finish.
 */
export async function* translate(events: AsyncIterable<WireEvent>): AsyncGenerator<StreamChunk> {
  const blocks = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let pendingFinish: FinishReason | undefined
  const usage: Partial<TokenUsage> = {}

  for await (const event of events) {
    switch (event.type) {
      case 'message_start': {
        if (event.message.usage !== undefined) Object.assign(usage, mapUsage(event.message.usage))
        break
      }
      case 'content_block_start': {
        const wire = event.content_block
        const kind = wire.type === 'thinking'
          ? 'reasoning'
          : wire.type === 'tool_use'
            ? 'tool-call'
            : 'text'
        const block: OpenBlock = {
          index: event.index,
          kind,
          text: '',
          ...wire.id !== undefined ? { callId: wire.id } : {},
          ...wire.name !== undefined ? { name: wire.name } : {},
        }
        blocks.set(event.index, block)
        order.push(block)
        yield { type: 'block-start', index: block.index, blockType: kind }
        break
      }
      case 'content_block_delta': {
        const block = blocks.get(event.index)
        if (block === undefined) {
          throw new LlmError(`content_block_delta for unopened block ${event.index}`, 'MALFORMED_RESPONSE')
        }
        const chunk = deltaChunk(block, event.delta)
        if (chunk !== undefined) yield chunk
        break
      }
      case 'content_block_stop': {
        const block = blocks.get(event.index)
        if (block === undefined) {
          throw new LlmError(`content_block_stop for unopened block ${event.index}`, 'MALFORMED_RESPONSE')
        }
        blocks.delete(event.index)
        break
      }
      case 'message_delta': {
        if (typeof event.delta.stop_reason === 'string') {
          pendingFinish = mapStopReason(event.delta.stop_reason)
        }
        if (event.usage?.output_tokens !== undefined) usage.outputTokens = event.usage.output_tokens
        break
      }
      case 'message_stop': {
        for (const block of order) {
          yield { type: 'block-end', index: block.index, block: closeBlock(block) }
        }
        if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
          yield { type: 'usage', usage: usage as TokenUsage }
        }
        const reason = pendingFinish ?? { kind: 'stop' as const }
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
      case 'ping':
        break
      case 'error': {
        throw new LlmError(
          event.error.message ?? 'provider streamed an error event',
          event.error.type ?? 'PROVIDER_ERROR',
        )
      }
    }
  }

  // parseSse guarantees the message_stop event (or throws); reaching here
  // means the event source violated that contract.
  throw new LlmError('SSE event stream ended without message_stop', 'STREAM_CLOSED')
}
