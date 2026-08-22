/**
 * Serialize harness messages into Codex backend Responses requests.
 * Text-only: image content is rejected before any wire serialization can
 * silently drop it. Harness reasoning blocks are NOT replayed: Codex
 * multi-turn thinking continuity rides on the provider's
 * `encrypted_content`, which the harness does not retain.
 *
 * @module dsh-llm-codex/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { WireInputItem, WireRequest, WireTool } from './types.ts'

/** Adapter-level request defaults (from plugin config). */
export interface RequestDefaults {
  /** Priority serving tier for tiered models, when this route declares one. */
  serviceTier?: string
}

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
    throw new LlmError('The Codex adapter does not support image content.', 'UNSUPPORTED_CONTENT')
  }
}

/**
 * Serialize the conversation into Responses input items. Harness system-role
 * messages fold into the top-level `instructions` slot together with the
 * explicit system prompt.
 * @param messages - the harness conversation, in order.
 * @param system - the explicit system prompt, when set.
 * @returns the instructions string and ordered input items.
 */
export function serializeConversation(
  messages: readonly Message[],
  system: string | undefined,
): { instructions: string | undefined; input: WireInputItem[] } {
  const instructionParts = [
    ...messages
      .filter(message => message.role === 'system')
      .map(message => flattenText(message.content)),
    ...system !== undefined ? [system] : [],
  ]
  const input: WireInputItem[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    for (const block of message.content) {
      assertTextOnly([block])
      if (block.type === 'text') {
        input.push({
          type: 'message',
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: [{
            type: message.role === 'assistant' ? 'output_text' : 'input_text',
            text: block.text,
          }],
        })
      } else if (block.type === 'tool-call') {
        input.push({
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: block.arguments,
        })
      } else if (block.type === 'tool-result') {
        // Empty tool output still needs SOME content on the wire.
        input.push({
          type: 'function_call_output',
          call_id: block.toolCallId,
          output: flattenText(block.content) || '(no output)',
        })
      }
      // reasoning blocks are dropped: see module doc.
    }
  }
  return {
    instructions: instructionParts.length === 0 ? undefined : instructionParts.join('\n\n'),
    input,
  }
}

/**
 * Map the harness reasoning-effort vocabulary to the Codex wire effort.
 * @param effort - adapter-owned effort id.
 * @returns the wire effort spelling.
 */
export function wireEffort(effort: string): string {
  if (effort === 'low' || effort === 'medium' || effort === 'high') return effort
  if (effort === 'max') return 'xhigh'
  throw new LlmError(`Codex does not support reasoning effort "${effort}"`, 'UNSUPPORTED_REASONING_EFFORT')
}

/**
 * Serialize one complete streaming request.
 * @param options - the harness generation request.
 * @param defaults - adapter-level request defaults.
 * @returns the Responses wire request body.
 */
export function serializeRequest(options: GenerateOptions, defaults: RequestDefaults): WireRequest {
  if (options.stop !== undefined) {
    throw new LlmError('The Codex Responses API does not support stop sequences.', 'UNSUPPORTED')
  }
  const { instructions, input } = serializeConversation(options.messages, options.system)
  return {
    model: options.model,
    ...instructions !== undefined ? { instructions } : {},
    input,
    stream: true,
    ...options.tools !== undefined && options.tools.length > 0
      ? {
        tools: options.tools.map(tool => ({
          type: 'function' as const,
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: false as const,
        })) satisfies WireTool[],
        tool_choice: 'auto' as const,
        parallel_tool_calls: false,
      }
      : {},
    ...options.reasoningEffort !== undefined
      ? { reasoning: { effort: wireEffort(options.reasoningEffort), summary: 'auto' as const } }
      : {},
    ...defaults.serviceTier !== undefined ? { service_tier: defaults.serviceTier } : {},
    store: false,
    include: ['reasoning.encrypted_content'],
  }
}
