/**
 * ChatGPT Codex backend Responses wire format as spoken by the Codex CLI
 * over a Codex subscription. Types only.
 *
 * Source of truth: the Codex CLI request shape reproduced by CLIProxyAPI's
 * codex executor (internal/runtime/executor), cross-checked against a live
 * subscription stream (2026-08).
 *
 * @module dsh-llm-codex/types
 */

/** Request body for `POST {baseURL}/codex/responses`. */
export interface WireRequest {
  model: string
  /** Top-level instruction slot; the harness system prompt maps here. */
  instructions?: string
  input: WireInputItem[]
  stream: true
  tools?: WireTool[]
  tool_choice?: 'auto'
  parallel_tool_calls?: boolean
  /** Effort + summary policy for reasoning models. */
  reasoning?: { effort: string; summary: 'auto' | 'detailed' | 'none' }
  /** Priority serving tier for tiered models (e.g. `gpt-5.6-luna`). */
  service_tier?: string
  /** Codex sessions are stateless server-side; encrypted reasoning carries continuity. */
  store: false
  include?: ['reasoning.encrypted_content']
}

/** One entry of the request `input` array, discriminated on `type`. */
export type WireInputItem =
  | WireMessageItem
  | WireFunctionCallItem
  | WireFunctionCallOutputItem

/** A conversation message item. */
export interface WireMessageItem {
  type: 'message'
  role: 'user' | 'assistant'
  content: { type: 'input_text' | 'output_text'; text: string }[]
}

/** A completed tool call replayed on assistant history; `arguments` is the raw JSON string. */
export interface WireFunctionCallItem {
  type: 'function_call'
  call_id: string
  name: string
  arguments: string
}

/** The result of one tool call, keyed by its call id. */
export interface WireFunctionCallOutputItem {
  type: 'function_call_output'
  call_id: string
  output: string
}

/** One entry of the request `tools` array; `parameters` is a JSON Schema object. */
export interface WireTool {
  type: 'function'
  name: string
  description: string
  parameters: Record<string, unknown>
  strict: false
}

/** One parsed SSE `data:` payload, discriminated on `type`. Event types this
 * union does not list arrive at the translator's ignore path at runtime. */
export type WireEvent =
  | { type: 'response.created' }
  | { type: 'response.output_item.added'; output_index: number; item: { type: 'message' | 'reasoning' | 'function_call'; id?: string; call_id?: string; name?: string } }
  | { type: 'response.output_item.done'; output_index: number }
  | { type: 'response.output_text.delta'; item_id: string; output_index: number; delta: string }
  | { type: 'response.reasoning_summary_text.delta'; item_id: string; output_index: number; delta: string }
  | { type: 'response.function_call_arguments.delta'; item_id: string; output_index: number; delta: string }
  | { type: 'response.output_text.done'; item_id: string }
  | { type: 'response.completed'; response: { usage?: WireUsage } }
  | { type: 'response.incomplete'; response: { usage?: WireUsage } }
  | { type: 'response.failed'; response: { error?: { message?: string; code?: string } } }
  | { type: 'error'; message?: string; param?: string; code?: string }

/**
 * Wire token accounting. `input_tokens` includes cache hits (subtracted into
 * `input_tokens_details.cached_tokens` by the harness mapping); reasoning
 * output is broken out in `output_tokens_details.reasoning_tokens`.
 */
export interface WireUsage {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  output_tokens_details?: { reasoning_tokens?: number }
}

/** Non-2xx error body. */
export interface WireError {
  error?: { message?: string; type?: string; code?: string }
}
