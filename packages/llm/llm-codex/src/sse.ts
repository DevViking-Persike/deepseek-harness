/**
 * Decode a Codex backend SSE byte stream into event `data` payloads. Framing
 * — chunk reassembly, UTF-8/CRLF/BOM handling, comment and non-data field
 * skipping, multi-`data:` joining — is `eventsource-parser`'s. Unlike the
 * chat-completions family there is no `[DONE]` sentinel: the server signals
 * completion with a terminal `response.completed` (or
 * `response.incomplete`/`response.failed`), which this module yields so the
 * caller owns final flushing; EOF before a terminal event raises
 * {@link LlmError}.
 *
 * @module dsh-llm-codex/sse
 */

import { EventSourceParserStream } from 'eventsource-parser/stream'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { WireEvent } from './types.ts'

/** Terminal event types a healthy or failed Codex stream ends with. */
const TERMINAL = new Set(['response.completed', 'response.incomplete', 'response.failed'])

/**
 * Parse an SSE byte stream into parsed event payloads. Yields the terminal
 * event as the final value and returns; throws `LlmError('STREAM_CLOSED')`
 * when the stream ends without one (truncated response — the model call
 * cannot be trusted).
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onComment - optional transport-activity callback; comments never enter the yielded payload stream.
 * @returns each parsed event in arrival order, the terminal event last.
 */
export async function* parseSse(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
): AsyncGenerator<WireEvent> {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onComment }))
  for await (const { data } of events) {
    let parsed: WireEvent
    try {
      parsed = JSON.parse(data) as WireEvent
    } catch {
      throw new LlmError(`malformed SSE payload: ${data.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }
    yield parsed
    if (TERMINAL.has(parsed.type)) return
  }
  throw new LlmError('SSE stream ended without a terminal response event', 'STREAM_CLOSED')
}
