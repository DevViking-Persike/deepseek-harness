/**
 * Real-composition guard: LlmRuntime and llm-codex (auth service + adapter)
 * boot from a test-only cordis.yml through the actual Loader + Include path
 * with a seeded credential document, a request reaches the scripted backend
 * with the Codex CLI identity headers and the priority tier for tiered
 * models, and a composition without a credential fails loud with
 * MISSING_CREDENTIAL.
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
import * as LlmCodex from '@deepseek-ai/dsh-llm-codex'
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
  options: { backendBase: string; seedCredential: boolean },
): Promise<Composition> {
  root = await mkdtemp(join(tmpdir(), 'dsh-llm-codex-'))
  vi.stubEnv('DSH_HOME', root)
  const credentialPath = join(root, 'codex-oauth.json')
  if (options.seedCredential) {
    await writeFile(credentialPath, `${JSON.stringify({
      version: 1,
      credential: {
        access: 'seed-access-token',
        refresh: 'seed-refresh-token',
        // Far future: no refresh fires during the test.
        expires: Date.now() + 3_600_000,
        accountId: 'seed-account-id',
        email: 'test@example.com',
      },
    }, null, 2)}\n`, { mode: 0o600 })
  }

  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: 'test-llm-service'",
    '- id: llm-codex',
    "  name: '@deepseek-ai/dsh-llm-codex'",
    '  config:',
    `    backendBase: ${JSON.stringify(options.backendBase)}`,
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
    ['@deepseek-ai/dsh-llm-codex', LlmCodex],
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

describe('llm-codex real composition', () => {
  it('boots from cordis.yml, sends the Codex CLI identity, and streams a completion', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ backendBase: server.url, seedCredential: true })

    const models = await ctx.llm.listModels('codex-oauth')
    expect(models.map(model => model.id)).toContain('gpt-5.6-luna')

    const { message, usage, finish } = await assemble(ctx, {
      model: 'gpt-5.6-sol',
      messages: [],
      maxTokens: 64,
    })
    expect(finish).toEqual({ kind: 'stop' })
    expect(message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(usage).toEqual({ inputTokens: 4, outputTokens: 1, cacheReadTokens: 3 })
    expect(server.headers[0]?.authorization).toBe('Bearer seed-access-token')
    expect(server.headers[0]?.['chatgpt-account-id']).toBe('seed-account-id')
    expect(server.headers[0]?.['openai-beta']).toBe('responses=experimental')
    expect(String(server.headers[0]?.originator)).toBe('codex-tui')
    expect(String(server.headers[0]?.['user-agent'])).toContain('codex-tui/')
    expect(server.requests[0]).toMatchObject({
      model: 'gpt-5.6-sol',
      stream: true,
      store: false,
    })
  })

  it('sends the priority tier for tiered models', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ backendBase: server.url, seedCredential: true })

    await assemble(ctx, { model: 'gpt-5.6-luna', messages: [], maxTokens: 64 })
    expect(server.requests[0]).toMatchObject({ model: 'gpt-5.6-luna', service_tier: 'priority' })
  })

  it('imports a CLIProxyAPI Codex auth file once, then serves its token', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    root = await mkdtemp(join(tmpdir(), 'dsh-llm-codex-'))
    vi.stubEnv('DSH_HOME', root)
    const sourcePath = join(root, 'codex-source.json')
    const credentialPath = join(root, 'codex-oauth.json')
    await writeFile(sourcePath, `${JSON.stringify({
      type: 'codex',
      email: 'dev@example.com',
      access_token: 'imported-access',
      refresh_token: 'imported-refresh',
      account_id: 'imported-account',
      expired: new Date(Date.now() + 3_600_000).toISOString(),
    }, null, 2)}\n`)

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: llm',
      "  name: 'test-llm-service'",
      '- id: llm-codex',
      "  name: '@deepseek-ai/dsh-llm-codex'",
      '  config:',
      `    backendBase: ${JSON.stringify(server.url)}`,
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
      ['@deepseek-ai/dsh-llm-codex', LlmCodex],
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

    await assemble(ctx, { model: 'gpt-5.6-sol', messages: [], maxTokens: 64 })
    expect(server.headers[0]?.authorization).toBe('Bearer imported-access')
    expect(server.headers[0]?.['chatgpt-account-id']).toBe('imported-account')
  })

  it('fails loud with MISSING_CREDENTIAL when no subscription is connected', async () => {
    const server = await mockServer([{ kind: 'sse', events: textEvents }])
    const { ctx } = await loadComposition({ backendBase: server.url, seedCredential: false })

    // Thrown adapter errors surface as an error finish through the runtime.
    const { finish } = await assemble(ctx, { model: 'gpt-5.6-sol', messages: [], maxTokens: 64 })
    expect(finish).toMatchObject({ kind: 'error', failure: { code: 'MISSING_CREDENTIAL' } })
    expect(server.requests).toHaveLength(0)
  })
})
