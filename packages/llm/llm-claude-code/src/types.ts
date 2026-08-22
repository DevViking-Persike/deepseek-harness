/**
 * Anthropic `/v1/messages` wire format as spoken by Claude Code over an
 * OAuth subscription. Types only.
 *
 * Source of truth: the Claude Code 2.1.x request shape reproduced by
 * CLIProxyAPI's claude executor (internal/runtime/executor), cross-checked
 * against a live subscription stream (2026-08).
 *
 * @module dsh-llm-claude-code/types
 */

/** Request body for `POST {baseURL}/v1/messages`. */
export interface WireRequest {
  model: string
  max_tokens: number
  /**
   * Top-level system slot, always in block form: the subscription endpoint
   * requires the Claude Code preamble to occupy a block of its own, so the
   * caller's prompt travels as a second block rather than concatenated text.
   */
  system: WireSystemBlock[]
  messages: WireMessage[]
  stream: true
  tools?: WireTool[]
  temperature?: number
  /** Stop sequences (Anthropic `stop_sequences`). */
  stop_sequences?: string[]
}

/** One block of the request `system` array. */
export interface WireSystemBlock {
  type: 'text'
  text: string
}

/** One entry of the request `messages` array, discriminated on `role`. */
export type WireMessage = WireUserMessage | WireAssistantMessage

/** User-role message: string or ordered content blocks. */
export interface WireUserMessage {
  role: 'user'
  content: string | WireUserContentBlock[]
}

/** Assistant-role message: string or ordered content blocks. */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string | WireAssistantContentBlock[]
}

/** Accepted user-side content blocks. */
export type WireUserContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_result'; tool_use_id: string; content: string }

/** Accepted assistant-side content blocks. */
export type WireAssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }

/** One entry of the request `tools` array; `input_schema` is a JSON Schema object. */
export interface WireTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

/** One parsed SSE event payload, discriminated on `type`. */
export type WireEvent =
  | { type: 'message_start'; message: { usage?: WireUsage } }
  | { type: 'content_block_start'; index: number; content_block: { type: 'text' | 'thinking' | 'tool_use'; id?: string; name?: string } }
  | { type: 'content_block_delta'; index: number; delta: WireDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason?: string }; usage?: { output_tokens?: number } }
  | { type: 'message_stop' }
  | { type: 'ping' }
  | { type: 'error'; error: { type?: string; message?: string } }

/** One streamed content delta, discriminated on `type`. */
export type WireDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'input_json_delta'; partial_json: string }

/**
 * Wire token accounting. `input_tokens` excludes cache reads; the harness
 * `TokenUsage` convention keeps them disjoint, so `cache_read_input_tokens`
 * maps to `cacheReadTokens` directly.
 */
export interface WireUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Non-2xx error body. */
export interface WireError {
  type?: string
  error?: { type?: string; message?: string }
}
