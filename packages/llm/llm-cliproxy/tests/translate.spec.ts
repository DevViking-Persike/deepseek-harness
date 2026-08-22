/** Unit coverage for the SSE payload translator: block ordering, deferred finish/usage, error mapping. */

import { describe, expect, it } from 'vitest'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { mapFinishReason, mapUsage, translate } from '../src/translate.ts'

async function collect(payloads: string[]): Promise<{ chunks: unknown[]; error?: unknown }> {
  const chunks: unknown[] = []
  try {
    for await (const chunk of translate((async function* () { yield* payloads })())) chunks.push(chunk)
  } catch (error) {
    return { chunks, error }
  }
  return { chunks }
}

describe('mapFinishReason', () => {
  it('maps the standard vocabulary', () => {
    expect(mapFinishReason('stop')).toEqual({ kind: 'stop' })
    expect(mapFinishReason('tool_calls')).toEqual({ kind: 'tool-calls' })
    expect(mapFinishReason('length')).toEqual({ kind: 'max-tokens' })
  })

  it('maps unrecognized reasons to error finishes', () => {
    expect(mapFinishReason('content_filter')).toEqual({
      kind: 'error',
      failure: { message: 'model stopped: content_filter', code: 'CONTENT_FILTER' },
    })
  })
})

describe('mapUsage', () => {
  it('subtracts cache hits from input tokens', () => {
    expect(mapUsage({
      prompt_tokens: 1373,
      completion_tokens: 4,
      prompt_tokens_details: { cached_tokens: 1358 },
    })).toEqual({ inputTokens: 15, outputTokens: 4, cacheReadTokens: 1358 })
  })

  it('keeps absent optional fields out', () => {
    expect(mapUsage({ prompt_tokens: 10, completion_tokens: 2 })).toEqual({ inputTokens: 10, outputTokens: 2 })
  })
})

describe('translate', () => {
  it('defers block-end, usage, and finish to [DONE] in that order', async () => {
    const { chunks, error } = await collect([
      '{"choices":[{"delta":{"role":"assistant"}}]}',
      '{"choices":[{"delta":{"reasoning_content":"thinking"}}]}',
      '{"choices":[{"delta":{"content":"hel"}}]}',
      '{"choices":[{"delta":{"content":"lo"}}]}',
      '{"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
      '[DONE]',
    ])
    expect(error).toBeUndefined()
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'reasoning' },
      { type: 'reasoning-delta', index: 0, text: 'thinking' },
      { type: 'block-start', index: 1, blockType: 'text' },
      { type: 'text-delta', index: 1, text: 'hel' },
      { type: 'text-delta', index: 1, text: 'lo' },
      { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'thinking' } },
      { type: 'block-end', index: 1, block: { type: 'text', text: 'hello' } },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  it('reassembles fragmented tool-call arguments by wire index', async () => {
    const { chunks, error } = await collect([
      JSON.stringify({ choices: [{ delta: { tool_calls: [{
        index: 0,
        id: 'call_1',
        function: { name: 'bash', arguments: '{"c' },
      }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{
        index: 0,
        function: { arguments: 'ommand":"ls"}' },
      }] } }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
      '[DONE]',
    ])
    expect(error).toBeUndefined()
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id: 'call_1', name: 'bash', argumentsDelta: '{"c' },
      { type: 'tool-call-delta', index: 0, id: 'call_1', name: 'bash', argumentsDelta: 'ommand":"ls"}' },
      {
        type: 'block-end',
        index: 0,
        block: { type: 'tool-call', id: 'call_1', name: 'bash', arguments: '{"command":"ls"}' },
      },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ])
  })

  it('maps a content-free stop completion to an EMPTY_RESPONSE error finish', async () => {
    const { chunks, error } = await collect([
      '{"choices":[{"delta":{},"finish_reason":"stop"}]}',
      '[DONE]',
    ])
    expect(error).toBeUndefined()
    expect(chunks).toEqual([{
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'model returned a completed response with no content', code: 'EMPTY_RESPONSE' },
      },
    }])
  })

  it('rejects malformed JSON payloads', async () => {
    const { error } = await collect(['{not json', '[DONE]'])
    expect(error).toBeInstanceOf(LlmError)
    expect((error as LlmError).code).toBe('MALFORMED_RESPONSE')
  })
})
