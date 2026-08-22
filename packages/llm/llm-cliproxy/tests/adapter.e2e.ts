/**
 * Real-API e2e against a live CLIProxyAPI instance. Self-skips without
 * CLIPROXY_API_KEY (optionally CLIPROXY_BASE_URL, default
 * http://127.0.0.1:8317/v1) — the repo testing policy owns key handling.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmCliProxy from '@deepseek-ai/dsh-llm-cliproxy'
import { assemble } from './assemble.ts'

const KEY = process.env.CLIPROXY_API_KEY
const BASE_URL = process.env.CLIPROXY_BASE_URL ?? 'http://127.0.0.1:8317/v1'

describe.skipIf(KEY === undefined || KEY.length === 0)('llm-cliproxy real proxy e2e', () => {
  it('streams a text completion from the claude route', async () => {
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmCliProxy, { baseURL: BASE_URL })
    try {
      const { message, finish } = await assemble(ctx, {
        model: 'claude-haiku-4-5-20251001',
        messages: [
          createUserMessage({
            content: [{ type: 'text', text: 'Reply with exactly: ok' }],
            source: { kind: 'plugin', plugin: 'test' },
          }),
        ],
        maxTokens: 32,
      })
      expect(finish).toEqual({ kind: 'stop' })
      expect(message.content.some(block => block.type === 'text' && block.text.includes('ok'))).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
