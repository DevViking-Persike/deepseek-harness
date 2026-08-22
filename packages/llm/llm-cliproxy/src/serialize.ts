/**
 * Serialize harness messages into CLIProxyAPI chat-completions requests.
 * Text-only: image content is rejected before any wire serialization can
 * silently drop it.
 *
 * @module dsh-llm-cliproxy/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { WireMessage, WireRequest, WireTool } from './types.ts'

/** Adapter-level request defaults (from plugin config). */
export interface RequestDefaults {
  /** Default per-request output cap; explicit request values win. */
  maxTokens?: number
}

/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks: ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject image content before any text-flattening path can silently erase it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The CLIProxyAPI chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message: Message): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: block.id,
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    // Text-less turns send "" — never null: the harness replays empty
    // content on tool-call-only turns and pure-null messages are rejected
    // by several upstream gateways. Reasoning-only turns keep "" for the
    // same reason: a null here would brick every later turn of a durably
    // logged session.
    content: text,
    ...reasoning.length > 0 ? { reasoning_content: reasoning } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role: 'tool'}` messages following their user-role text.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved, each tool result expanded into its own entry.
 */
export function serializeMessages(messages: readonly Message[]): WireMessage[] {
  const wire: WireMessage[] = []
  for (const message of messages) {
    assertTextOnly(message.content)
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message))
      continue
    }
    // user role: tool results ride in user messages in the harness
    // vocabulary, but chat-completions wants them as role:'tool' messages.
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return wire
}

/**
 * Serialize one complete streaming request.
 * @param options - the harness generation request.
 * @param defaults - adapter-level request defaults.
 * @returns the chat-completions wire request body.
 */
export function serializeRequest(options: GenerateOptions, defaults: RequestDefaults): WireRequest {
  const messages = serializeMessages(options.messages)
  return {
    model: options.model,
    messages: options.system === undefined || options.system.length === 0
      ? messages
      : [{ role: 'system', content: options.system }, ...messages],
    stream: true,
    stream_options: { include_usage: true },
    ...options.tools !== undefined && options.tools.length > 0
      ? {
        tools: options.tools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })) satisfies WireTool[],
      }
      : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens !== undefined
      ? { max_tokens: options.maxTokens }
      : defaults.maxTokens !== undefined
        ? { max_tokens: defaults.maxTokens }
        : {},
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}
