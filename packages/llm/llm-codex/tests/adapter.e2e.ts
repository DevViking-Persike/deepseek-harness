/**
 * Real-API e2e against the ChatGPT backend Codex Responses endpoint over a
 * Codex subscription. Self-skips without DSH_CODEX_IMPORT (a CLIProxyAPI
 * Codex auth file to import); the repo testing policy owns credential
 * handling.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmCodex from '@deepseek-ai/dsh-llm-codex'
import { assemble } from './assemble.ts'

const IMPORT = process.env.DSH_CODEX_IMPORT
let root: string | undefined

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

describe.skipIf(IMPORT === undefined || IMPORT.length === 0)('llm-codex real subscription e2e', () => {
  it('imports the CLIProxyAPI credential and streams a text completion', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-llm-codex-e2e-'))
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmCodex, {
      path: join(root, 'codex-oauth.json'),
      importFrom: IMPORT!,
      controlPort: 0,
    })
    try {
      const { message, finish } = await assemble(ctx, {
        model: 'gpt-5.5',
        messages: [
          createUserMessage({
            content: [{ type: 'text', text: 'Reply with exactly: ok' }],
            source: { kind: 'plugin', plugin: 'test' },
          }),
        ],
        maxTokens: 64,
      })
      expect(['stop', 'max-tokens']).toContain(finish.kind)
      expect(message.content.some(block => block.type === 'text' && block.text.includes('ok'))).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
