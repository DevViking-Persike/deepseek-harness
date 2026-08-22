/** Unit coverage for request serialization: system slot, tool expansion, image rejection. */

import { describe, expect, it } from 'vitest'
import { CallId, createMessage, createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'

import { serializeMessages, serializeRequest } from '../src/serialize.ts'

describe('serializeMessages', () => {
  it('expands user-message tool results into standalone tool messages', () => {
    const wire = serializeMessages([
      createUserMessage({
        content: [
          { type: 'text', text: 'run it' },
          { type: 'tool-result', toolCallId: CallId('call_1'), content: [{ type: 'text', text: 'ok' }] },
        ],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])
    expect(wire).toEqual([
      { role: 'user', content: 'run it' },
      { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
    ])
  })

  it('replays assistant reasoning and tool calls with empty-string content', () => {
    const wire = serializeMessages([
      createMessage({
        role: 'assistant',
        content: [
          { type: 'reasoning', text: 'why' },
          { type: 'tool-call', id: CallId('call_1'), name: 'bash', arguments: '{"command":"ls"}' },
        ],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])
    expect(wire).toEqual([{
      role: 'assistant',
      content: '',
      reasoning_content: 'why',
      tool_calls: [{
        id: 'call_1',
        type: 'function',
        function: { name: 'bash', arguments: '{"command":"ls"}' },
      }],
    }])
  })

  it('substitutes a placeholder for empty tool output', () => {
    const wire = serializeMessages([
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: CallId('call_1'), content: [] }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ])
    expect(wire).toEqual([{ role: 'tool', tool_call_id: 'call_1', content: '(no output)' }])
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
  it('maps the system slot to a leading system message and tools to wire tools', () => {
    const body = serializeRequest({
      provider: 'cliproxy-claude',
      model: 'claude-sonnet-5',
      system: 'be brief',
      messages: [
        createUserMessage({
          content: [{ type: 'text', text: 'hi' }],
          source: { kind: 'plugin', plugin: 'test' },
        }),
      ],
      tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }],
      temperature: 0.2,
      maxTokens: 100,
    }, { maxTokens: 5000 })
    expect(body).toEqual({
      model: 'claude-sonnet-5',
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: 'be brief' },
        { role: 'user', content: 'hi' },
      ],
      tools: [{
        type: 'function',
        function: { name: 'bash', description: 'run', parameters: { type: 'object' } },
      }],
      temperature: 0.2,
      max_tokens: 100,
    })
  })

  it('falls back to the adapter default output cap', () => {
    const body = serializeRequest({
      provider: 'cliproxy-claude',
      model: 'claude-sonnet-5',
      messages: [],
    }, { maxTokens: 5000 })
    expect(body.max_tokens).toBe(5000)
  })
})
