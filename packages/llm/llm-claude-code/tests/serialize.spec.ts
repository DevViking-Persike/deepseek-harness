/** Unit coverage for request serialization: system slot, tool blocks, image rejection. */

import { describe, expect, it } from 'vitest'
import { CallId, createMessage, createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import { serializeMessages, serializeRequest } from '../src/serialize.ts'

describe('serializeMessages', () => {
  it('maps tool results to tool_result blocks and text to text blocks', () => {
    const wire = serializeMessages([
      createUserMessage({
        content: [
          { type: 'text', text: 'run it' },
          { type: 'tool-result', toolCallId: CallId('toolu_1'), content: [{ type: 'text', text: 'ok' }] },
        ],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])
    expect(wire).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'run it' },
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
      ],
    }])
  })

  it('maps assistant tool calls to tool_use blocks with parsed input', () => {
    const wire = serializeMessages([
      createMessage({
        role: 'assistant',
        content: [{ type: 'tool-call', id: CallId('toolu_1'), name: 'bash', arguments: '{"command":"ls"}' }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])
    expect(wire).toEqual([{
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'bash', input: { command: 'ls' } }],
    }])
  })

  it('drops assistant reasoning blocks (unsigned thinking is rejected upstream)', () => {
    const wire = serializeMessages([
      createMessage({
        role: 'assistant',
        content: [{ type: 'reasoning', text: 'why' }, { type: 'text', text: 'answer' }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])
    expect(wire).toEqual([{ role: 'assistant', content: [{ type: 'text', text: 'answer' }] }])
  })

  it('substitutes a placeholder for empty tool output', () => {
    const wire = serializeMessages([
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: CallId('toolu_1'), content: [] }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])
    expect(wire).toEqual([{
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '(no output)' }],
    }])
  })

  it('rejects image content instead of flattening it away', () => {
    expect(() => serializeMessages([
      createUserMessage({
        content: [{ type: 'image', attachment: 'att' as never }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])).toThrow(LlmError)
  })
})

describe('serializeRequest', () => {
  it('keeps the Claude Code preamble in its own system block and folds the caller prompt into a second', () => {
    const body = serializeRequest({
      provider: 'claude-code-oauth',
      model: 'claude-sonnet-5',
      system: 'be brief',
      messages: [
        createMessage({ role: 'system', content: [{ type: 'text', text: 'earlier' }], source: { kind: 'plugin', plugin: 'test' } }),
        createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'plugin', plugin: 'test' } }),
      ],
      tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }],
      temperature: 0.2,
      maxTokens: 100,
    }, { maxTokens: 5000 })
    expect(body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 100,
      system: [
        { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
        { type: 'text', text: 'earlier\n\nbe brief' },
      ],
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      stream: true,
      tools: [{ name: 'bash', description: 'run', input_schema: { type: 'object' } }],
      temperature: 0.2,
    })
  })

  it('sends the preamble block alone when the caller supplies no system prompt', () => {
    const body = serializeRequest({
      provider: 'claude-code-oauth',
      model: 'claude-sonnet-5',
      messages: [],
    }, { maxTokens: 5000 })
    expect(body.system).toEqual([
      { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
    ])
  })

  it('falls back to the adapter default output cap and maps stop sequences', () => {
    const body = serializeRequest({
      provider: 'claude-code-oauth',
      model: 'claude-sonnet-5',
      messages: [],
      stop: ['END'],
    }, { maxTokens: 5000 })
    expect(body.max_tokens).toBe(5000)
    expect(body.stop_sequences).toEqual(['END'])
  })
})
