/** Unit coverage for the Responses event translator: block lifecycle, deferred usage/finish, error mapping. */

import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { WireEvent } from '../src/types.ts'
import { mapUsage, translate } from '../src/translate.ts'

async function collect(events: WireEvent[]): Promise<{ chunks: unknown[]; error?: unknown }> {
  const chunks: unknown[] = []
  try {
    for await (const chunk of translate((async function* () { yield* events })())) chunks.push(chunk)
  } catch (error) {
    return { chunks, error }
  }
  return { chunks }
}

describe('mapUsage', () => {
  it('subtracts cache hits from input tokens and breaks out reasoning', () => {
    expect(mapUsage({
      input_tokens: 10,
      output_tokens: 4,
      input_tokens_details: { cached_tokens: 3 },
      output_tokens_details: { reasoning_tokens: 2 },
    })).toEqual({ inputTokens: 7, outputTokens: 4, cacheReadTokens: 3, reasoningTokens: 2 })
  })

  it('keeps absent optional fields out', () => {
    expect(mapUsage({ input_tokens: 10, output_tokens: 2 })).toEqual({ inputTokens: 10, outputTokens: 2 })
  })
})

describe('translate', () => {
  it('defers block-end, usage, and finish to response.completed in that order', async () => {
    const { chunks, error } = await collect([
      { type: 'response.created' },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1' } },
      { type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', output_index: 0, delta: 'why' },
      { type: 'response.output_item.done', output_index: 0 },
      { type: 'response.output_item.added', output_index: 1, item: { type: 'message', id: 'msg_1' } },
      { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, delta: 'hel' },
      { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 1, delta: 'lo' },
      { type: 'response.output_item.done', output_index: 1 },
      {
        type: 'response.completed',
        response: { usage: { input_tokens: 7, output_tokens: 2 } },
      },
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

  it('reassembles function-call argument deltas and finishes tool-calls', async () => {
    const { chunks, error } = await collect([
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'bash' } },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: '{"com' },
      { type: 'response.function_call_arguments.delta', item_id: 'fc_1', output_index: 0, delta: 'mand":"ls"}' },
      { type: 'response.output_item.done', output_index: 0 },
      {
        type: 'response.completed',
        response: { usage: { input_tokens: 5, output_tokens: 9 } },
      },
    ])
    expect(error).toBeUndefined()
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 'call_1', name: 'bash', argumentsDelta: '{"com' },
      { type: 'tool-call-delta', index: 0, id: 'call_1', name: 'bash', argumentsDelta: 'mand":"ls"}' },
      {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: 'call_1', name: 'bash', arguments: '{"command":"ls"}' },
      },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 9 } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('maps response.incomplete to a max-tokens finish', async () => {
    const { chunks, error } = await collect([
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1' } },
      { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, delta: 'partial' },
      { type: 'response.incomplete', response: { usage: { input_tokens: 5, output_tokens: 9 } } },
    ])
    expect(error).toBeUndefined()
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'max-tokens' } })
  })

  it('maps response.failed to an error finish', async () => {
    const { chunks, error } = await collect([
      { type: 'response.failed', response: { error: { message: 'upstream died', code: 'RATE_LIMIT' } } },
    ])
    expect(error).toBeUndefined()
    expect(chunks.at(-1)).toEqual({
      type: 'finish',
      reason: { kind: 'error', failure: { message: 'upstream died', code: 'RATE_LIMIT' } },
    })
  })

  it('maps a content-free completion to an EMPTY_RESPONSE error finish', async () => {
    const { chunks, error } = await collect([
      { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 0 } } },
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

  it('throws the error event as an LlmError', async () => {
    const { error } = await collect([
      { type: 'error', message: 'Usage limit reached', code: 'usage_limit_reached' },
    ])
    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).code).toBe('usage_limit_reached')
  })
})
