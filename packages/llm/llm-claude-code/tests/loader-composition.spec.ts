/**
 * Real-composition guard: LlmRuntime and llm-claude-code (auth service +
 * adapter) boot from a test-only cordis.yml through the actual Loader +
 * Include path with a seeded credential document, a request reaches the
 * scripted endpoint with the Claude Code identity headers, and disposing
 * the root fiber tears the composition down with it. A second composition
 * without a credential fails loud with MISSING_CREDENTIAL.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmClaudeCode from '@deepseek-ai/dsh-llm-claude-code'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await closeMockServers()
  vi.unstubAllEnvs()
})

interface Composition {
  ctx: Context
  credentialPath: string
}

async function loadComposition(
  options: { apiBase: string; seedCredential: boolean },
): Promise<Composition> {
  root = await mkdtemp(join(tmpdir(), 'dsh-llm-claude-code-'))
  vi.stubEnv('DSH_HOME', root)
  const credentialPath = join(root, 'claude-code-oauth.json')
  if (options.seedCredential) {
    await writeFile(credentialPath, `${JSON.stringify({
      version: 1,
      credential: {
        access: 'seed-access-token',
        refresh: 'seed-refresh-token',
        // Far future: no refresh fires during the test.
        expires: Date.now() + 3_600_000,
        email: 'test@example.com',
      },
    }, null, 2)}\n`, { mode: 0o600 })
  }

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: 'test-llm-service'",
    '- id: llm-claude-code',
    "  name: '@deepseek-ai/dsh-llm-claude-code'",
    '  config:',
    `    apiBase: ${JSON.stringify(options.apiBase)}`,
    `    path: ${JSON.stringify(credentialPath)}`,
    '    controlPort: 0',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-llm-service', LlmRuntime],
    ['@deepseek-ai/dsh-llm-claude-code', LlmClaudeCode],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx, credentialPath }
}

describe('llm-claude-code real composition', () => {
  it('boots from cordis.yml, sends the Claude Code identity, and streams a completion', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ apiBase: server.url, seedCredential: true })

    const models = await ctx.llm.listModels('claude-code-oauth')
    expect(models.map(model => model.id)).toContain('claude-sonnet-5')

    // The capacity the endpoint actually serves this subscription, each value
    // measured from the rejection that names the limit. Resolved through the
    // assembled composition because compaction reads the exact-route context,
    // not the advisory listing.
    const resolved = await Promise.all([
      'claude-fable-5',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ].map(async id => [
      id,
      (await ctx.llm.resolveModelInfo('claude-code-oauth', id)).context?.contextWindow,
    ] as const))
    expect(Object.fromEntries(resolved)).toEqual({
      'claude-fable-5': 1_000_000,
      'claude-opus-5': 1_000_000,
      'claude-sonnet-5': 1_000_000,
      'claude-opus-4-8': 1_000_000,
      // Serves beyond 200k only while pay-as-you-go credit is attached, so the
      // catalog keeps the window every subscription request can rely on.
      'claude-sonnet-4-6': 200_000,
      'claude-haiku-4-5-20251001': 200_000,
    })

    const { message, usage, finish } = await assemble(ctx, {
      model: 'claude-sonnet-5',
      messages: [],
      maxTokens: 64,
    })
    expect(finish).toEqual({ kind: 'stop' })
    expect(message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(usage).toEqual({ inputTokens: 7, outputTokens: 1 })
    expect(server.headers[0]?.authorization).toBe('Bearer seed-access-token')
    expect(server.headers[0]?.['anthropic-beta']).toContain('oauth-2025-04-20')
    // The 1M models serve that window natively, while models without it reject
    // this beta outright, so it must never ride along.
    expect(server.headers[0]?.['anthropic-beta']).not.toContain('context-1m')
    expect(String(server.headers[0]?.['user-agent'])).toContain('claude-cli/')
    expect(server.requests[0]).toMatchObject({ model: 'claude-sonnet-5', stream: true })
  })

  it('imports a CLIProxyAPI Claude auth file once, then serves its token', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    root = await mkdtemp(join(tmpdir(), 'dsh-llm-claude-code-'))
    vi.stubEnv('DSH_HOME', root)
    const sourcePath = join(root, 'claude-source.json')
    const credentialPath = join(root, 'claude-code-oauth.json')
    await writeFile(sourcePath, `${JSON.stringify({
      type: 'claude',
      email: 'dev@example.com',
      access_token: 'imported-access',
      refresh_token: 'imported-refresh',
      expired: new Date(Date.now() + 3_600_000).toISOString(),
    }, null, 2)}\n`)

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: llm',
      "  name: 'test-llm-service'",
      '- id: llm-claude-code',
      "  name: '@deepseek-ai/dsh-llm-claude-code'",
      '  config:',
      `    apiBase: ${JSON.stringify(server.url)}`,
      `    path: ${JSON.stringify(credentialPath)}`,
      `    importFrom: ${JSON.stringify(sourcePath)}`,
      '    controlPort: 0',
      '',
    ].join('\n'))
    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['test-llm-service', LlmRuntime],
      ['@deepseek-ai/dsh-llm-claude-code', LlmClaudeCode],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await ctx.loader.await()

    await assemble(ctx, { model: 'claude-sonnet-5', messages: [], maxTokens: 64 })
    expect(server.headers[0]?.authorization).toBe('Bearer imported-access')
  })

  it('fails loud with MISSING_CREDENTIAL when no subscription is connected', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ apiBase: server.url, seedCredential: false })

    // Thrown adapter errors surface as an error finish through the runtime.
    const { finish } = await assemble(ctx, { model: 'claude-sonnet-5', messages: [], maxTokens: 64 })
    expect(finish).toMatchObject({ kind: 'error', failure: { code: 'MISSING_CREDENTIAL' } })
    expect(server.requests).toHaveLength(0)
  })
})
