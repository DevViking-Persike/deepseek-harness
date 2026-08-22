/** Unit coverage for request serialization: instructions slot, input items, tiers, rejection paths. */

import { describe, expect, it } from 'vitest'
import { CallId, createMessage, createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import { serializeConversation, serializeRequest, wireEffort } from '../src/serialize.ts'

describe('serializeConversation', () => {
  it('maps user text, assistant tool calls, and tool results to Responses items', () => {
    const { instructions, input } = serializeConversation([
      createMessage({ role: 'system', content: [{ type: 'text', text: 'be brief' }], source: { kind: 'plugin', plugin: 'test' } }),
      createUserMessage({ content: [{ type: 'text', text: 'run it' }], source: { kind: 'plugin', plugin: 'test' } }),
      createMessage({
        role: 'assistant',
        content: [{ type: 'tool-call', id: CallId('call_1'), name: 'bash', arguments: '{"command":"ls"}' }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: CallId('call_1'), content: [{ type: 'text', text: 'ok' }] }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], 'extra prompt')
    expect(instructions).toBe('be brief\n\nextra prompt')
    expect(input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'run it' }] },
      { type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '{"command":"ls"}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'ok' },
    ])
  })

  it('substitutes a placeholder for empty tool output', () => {
    const { input } = serializeConversation([
      createUserMessage({
        content: [{ type: 'tool-result', toolCallId: CallId('call_1'), content: [] }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], undefined)
    expect(input).toEqual([{ type: 'function_call_output', call_id: 'call_1', output: '(no output)' }])
  })

  it('drops assistant reasoning blocks (encrypted continuity is not retained)', () => {
    const { input } = serializeConversation([
      createMessage({
        role: 'assistant',
        content: [{ type: 'reasoning', text: 'why' }, { type: 'text', text: 'answer' }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], undefined)
    expect(input).toEqual([{
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'answer' }],
    }])
  })

  it('rejects image content instead of flattening it away', () => {
    expect(() => serializeConversation([
      createUserMessage({
        content: [{ type: 'image', attachment: 'att' as never }],
        source: { kind: 'plugin', plugin: 'test' },
      }),
    ], undefined)).toThrow(LlmError)
  })
})

describe('wireEffort', () => {
  it('maps the harness vocabulary to Codex wire efforts', () => {
    expect(wireEffort('low')).toBe('low')
    expect(wireEffort('medium')).toBe('medium')
    expect(wireEffort('high')).toBe('high')
    expect(wireEffort('max')).toBe('xhigh')
  })

  it('rejects unsupported efforts', () => {
    expect(() => wireEffort('off')).toThrow(LlmError)
  })
})

describe('serializeRequest', () => {
  it('assembles tools, reasoning, and tier; the backend owns the output cap', () => {
    const body = serializeRequest({
      provider: 'codex-oauth',
      model: 'gpt-5.6-luna',
      system: 'be brief',
      messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'plugin', plugin: 'test' } })],
      tools: [{ name: 'bash', description: 'run', parameters: { type: 'object' } }],
      reasoningEffort: 'max' as never,
      maxTokens: 100,
    }, { serviceTier: 'priority' })
    expect(body).toEqual({
      model: 'gpt-5.6-luna',
      instructions: 'be brief',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
      stream: true,
      tools: [{
        type: 'function',
        name: 'bash',
        description: 'run',
        parameters: { type: 'object' },
        strict: false,
      }],
      tool_choice: 'auto',
      parallel_tool_calls: false,
      reasoning: { effort: 'xhigh', summary: 'auto' },
      service_tier: 'priority',
      store: false,
      include: ['reasoning.encrypted_content'],
    })
  })

  it('sends no tier for untiered models and rejects stop sequences', () => {
    const body = serializeRequest({
      provider: 'codex-oauth',
      model: 'gpt-5.6-sol',
      messages: [],
    }, {})
    expect(body).not.toHaveProperty('service_tier')
    expect(body).not.toHaveProperty('max_output_tokens')
    expect(() => serializeRequest({
      provider: 'codex-oauth',
      model: 'gpt-5.6-sol',
      messages: [],
      stop: ['END'],
    }, {})).toThrow(LlmError)
  })
})
