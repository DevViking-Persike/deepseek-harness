/**
 * Real-API e2e against Anthropic over a Claude subscription. Self-skips
 * without DSH_CLAUDE_CODE_IMPORT (a CLIProxyAPI Claude auth file to import);
 * the repo testing policy owns credential handling.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as LlmClaudeCode from '@deepseek-ai/dsh-llm-claude-code'
import { assemble } from './assemble.ts'

const IMPORT = process.env.DSH_CLAUDE_CODE_IMPORT
let root: string | undefined

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

describe.skipIf(IMPORT === undefined || IMPORT.length === 0)('llm-claude-code real subscription e2e', () => {
  it('imports the CLIProxyAPI credential and streams a text completion', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-llm-claude-code-e2e-'))
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(LlmClaudeCode, {
      path: join(root, 'claude-code-oauth.json'),
      importFrom: IMPORT!,
      controlPort: 0,
    })
    try {
      const { message, finish } = await assemble(ctx, {
        model: 'claude-fable-5',
        messages: [
          createUserMessage({
            content: [{ type: 'text', text: 'Reply with exactly: ok' }],
            source: { kind: 'plugin', plugin: 'test' },
          }),
        ],
        maxTokens: 32,
      })
      expect(['stop', 'max-tokens']).toContain(finish.kind)
      expect(message.content.some(block => block.type === 'text' && block.text.includes('ok'))).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
