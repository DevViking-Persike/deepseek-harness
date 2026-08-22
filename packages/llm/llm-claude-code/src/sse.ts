/**
 * Decode an Anthropic SSE byte stream into event `data` payloads. Framing —
 * chunk reassembly, UTF-8/CRLF/BOM handling, comment and non-data field
 * skipping, multi-`data:` joining — is `eventsource-parser`'s. Unlike the
 * OpenAI family there is no `[DONE]` sentinel: the server signals completion
 * with a `message_stop` event, which this module yields so the caller owns
 * final flushing; EOF before it raises {@link LlmError}.
 *
 * @module dsh-llm-claude-code/sse
 */

import { EventSourceParserStream } from 'eventsource-parser/stream'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { WireEvent } from './types.ts'

/**
 * Parse an SSE byte stream into parsed event payloads. Yields the
 * `message_stop` event as the final value and returns; throws
 * `LlmError('STREAM_CLOSED')` when the stream ends without it (truncated
 * response — the model call cannot be trusted).
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onComment - optional transport-activity callback; comments never enter the yielded payload stream.
 * @returns each parsed event in arrival order, `message_stop` last.
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
    if (parsed.type === 'message_stop') return
  }
  // Falling out of the loop means the terminator never arrived: a truncated
  // response must not be mistaken for a complete one.
  throw new LlmError('SSE stream ended without message_stop', 'STREAM_CLOSED')
}
