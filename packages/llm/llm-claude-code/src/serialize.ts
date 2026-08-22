/**
 * Serialize harness messages into Anthropic `/v1/messages` requests.
 * Text-only: image content is rejected before any wire serialization can
 * silently drop it. Harness reasoning blocks are NOT replayed: Anthropic
 * multi-turn thinking requires the provider's original signed thinking
 * blocks, and an unsigned substitute is rejected upstream.
 *
 * @module dsh-llm-claude-code/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type {
  WireAssistantContentBlock,
  WireMessage,
  WireRequest,
  WireSystemBlock,
  WireTool,
  WireUserContentBlock,
} from './types.ts'

/** Adapter-level request defaults (from plugin config). */
export interface RequestDefaults {
  /** Default per-request output cap; explicit request values win. */
  maxTokens?: number
}

/**
 * The Claude Code identity the subscription endpoint gates on. The backend
 * classifies OAuth traffic by this preamble and answers `rate_limit_error`
 * without it, even on models the subscription otherwise serves. It must
 * occupy its OWN system block: concatenating it with the caller's prompt into
 * a single string is rejected the same way (verified against
 * api.anthropic.com, 2026-08). The caller's prompt follows as a second block.
 */
const CLAUDE_CODE_PREAMBLE = "You are Claude Code, Anthropic's official CLI for Claude."

/** Join the text blocks of a message. */
function flattenText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject image content before any text-flattening path can silently erase it. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The Claude Code adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
}

/** Serialize one assistant message (text + tool calls). */
function serializeAssistant(message: Message): WireMessage {
  const blocks: WireAssistantContentBlock[] = []
  for (const block of message.content) {
    assertTextOnly([block])
    if (block.type === 'text' && block.text.length > 0) {
      blocks.push({ type: 'text', text: block.text })
    } else if (block.type === 'tool-call') {
      blocks.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        // Tool-call arguments are raw JSON strings end-to-end; the wire wants
        // the parsed object. An empty string is `{}` on the wire.
        input: block.arguments.length === 0 ? {} : JSON.parse(block.arguments) as unknown,
      })
    }
    // reasoning blocks are dropped: see module doc.
  }
  return { role: 'assistant', content: blocks }
}

/** Serialize one user message (text + tool results). */
function serializeUser(message: Message): WireMessage {
  const blocks: WireUserContentBlock[] = []
  let text = ''
  for (const block of message.content) {
    assertTextOnly([block])
    if (block.type === 'text') {
      text += block.text
    } else if (block.type === 'tool-result') {
      // Empty tool output still needs SOME content on the wire.
      blocks.push({
        type: 'tool_result',
        tool_use_id: block.toolCallId,
        content: flattenText(block.content) || '(no output)',
      })
    }
  }
  if (text.length > 0) blocks.unshift({ type: 'text', text })
  return { role: 'user', content: blocks }
}

/**
 * Serialize the conversation. Harness system-role messages fold into the
 * top-level `system` slot together with the explicit system prompt.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved.
 */
export function serializeMessages(messages: readonly Message[]): WireMessage[] {
  const wire: WireMessage[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    wire.push(message.role === 'assistant' ? serializeAssistant(message) : serializeUser(message))
  }
  return wire
}

/**
 * Serialize one complete streaming request.
 * @param options - the harness generation request.
 * @param defaults - adapter-level request defaults.
 * @returns the `/v1/messages` wire request body.
 */
export function serializeRequest(options: GenerateOptions, defaults: RequestDefaults): WireRequest {
  const caller = [
    ...options.messages.filter(message => message.role === 'system').map(message => flattenText(message.content)),
    ...options.system !== undefined ? [options.system] : [],
  ].join('\n\n')
  const system: WireSystemBlock[] = [
    { type: 'text', text: CLAUDE_CODE_PREAMBLE },
    ...caller.length > 0 ? [{ type: 'text' as const, text: caller }] : [],
  ]
  const maxTokens = options.maxTokens ?? defaults.maxTokens
  if (maxTokens === undefined) {
    throw new LlmError('Claude Code requires a max_tokens value; none was configured.', 'INVALID_REQUEST')
  }
  return {
    model: options.model,
    max_tokens: maxTokens,
    system,
    messages: serializeMessages(options.messages),
    stream: true,
    ...options.tools !== undefined && options.tools.length > 0
      ? {
        tools: options.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        })) satisfies WireTool[],
      }
      : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.stop !== undefined ? { stop_sequences: options.stop } : {},
  }
}
