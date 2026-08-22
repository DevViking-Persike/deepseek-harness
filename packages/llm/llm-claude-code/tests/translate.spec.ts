/** Unit coverage for the Anthropic event translator: block lifecycle, deferred usage/finish, error mapping. */

import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { WireEvent } from '../src/types.ts'
import { mapStopReason, mapUsage, translate } from '../src/translate.ts'

async function collect(events: WireEvent[]): Promise<{ chunks: unknown[]; error?: unknown }> {
  const chunks: unknown[] = []
  try {
    for await (const chunk of translate((async function* () { yield* events })())) chunks.push(chunk)
  } catch (error) {
    return { chunks, error }
  }
  return { chunks }
}

describe('mapStopReason', () => {
  it('maps the standard vocabulary', () => {
    expect(mapStopReason('end_turn')).toEqual({ kind: 'stop' })
    expect(mapStopReason('stop_sequence')).toEqual({ kind: 'stop' })
    expect(mapStopReason('tool_use')).toEqual({ kind: 'tool-calls' })
    expect(mapStopReason('max_tokens')).toEqual({ kind: 'max-tokens' })
  })

  it('maps unrecognized reasons to error finishes', () => {
    expect(mapStopReason('refusal')).toEqual({
      kind: 'error',
      failure: { message: 'model stopped: refusal', code: 'REFUSAL' },
    })
  })
})

describe('mapUsage', () => {
  it('maps disjoint counts without subtraction', () => {
    expect(mapUsage({ input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 4 }))
      .toEqual({ inputTokens: 10, outputTokens: 2, cacheReadTokens: 4 })
  })

  it('keeps absent fields out', () => {
    expect(mapUsage({ input_tokens: 10 })).toEqual({ inputTokens: 10 })
  })
})

describe('translate', () => {
  it('defers block-end, usage, and finish to message_stop in that order', async () => {
    const { chunks, error } = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 7 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'why' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'text' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'hel' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'lo' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
      { type: 'ping' },
      { type: 'message_stop' },
    ])
    expect(error).toBeUndefined()
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'why' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'hel' },
      { type: 'text-delta', index: 1, text: 'lo' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'why' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'hello' } },
      { type: 'usage', usage: { inputTokens: 7, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('reassembles tool_use JSON deltas by wire index', async () => {
    const { chunks, error } = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'bash' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"com' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'mand":"ls"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } },
      { type: 'message_stop' },
    ])
    expect(error).toBeUndefined()
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 'toolu_1', name: 'bash', argumentsDelta: '{"com' },
      { type: 'tool-call-delta', index: 0, id: 'toolu_1', name: 'bash', argumentsDelta: 'mand":"ls"}' },
      {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: 'toolu_1', name: 'bash', arguments: '{"command":"ls"}' },
      },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 9 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('maps a content-free end_turn completion to an EMPTY_RESPONSE error finish', async () => {
    const { chunks, error } = await collect([
      { type: 'message_start', message: { usage: { input_tokens: 5 } } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } },
      { type: 'message_stop' },
    ])
    expect(error).toBeUndefined()
    expect(chunks).toEqual([
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 0 } },
      {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: { message: 'model returned a completed response with no content', code: 'EMPTY_RESPONSE' },
        },
      },
    ])
  })

  it('throws the provider error event as an LlmError', async () => {
    const { error } = await collect([
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    ])
    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).code).toBe('overloaded_error')
  })

  it('rejects deltas for unopened blocks', async () => {
    const { error } = await collect([
      { type: 'content_block_delta', index: 3, delta: { type: 'text_delta', text: 'x' } },
    ])
    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).code).toBe('MALFORMED_RESPONSE')
  })
})
