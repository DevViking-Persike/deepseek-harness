/**
 * treadmill.* domain: the host-owned OpenNjord installation, described and
 * edited through the gateway. The service seeds a temporary root from the
 * vendored assets, so every row runs against real files.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import Treadmill from '@deepseek-ai/dsh-treadmill'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '../src/api-proxy.ts'

function signal(): AbortSignal {
  return new AbortController().signal
}

const request = <P>(payload: P): { rpcId: ReturnType<typeof RpcId>; payload: P } =>
  ({ rpcId: RpcId('t-treadmill'), payload })

async function harness(withTreadmill: boolean) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SkillRegistry)
  const root = join(mkdtempSync(join(tmpdir(), 'dsh-treadmill-spec-')), 'install')
  if (withTreadmill) await ctx.plugin(Treadmill, { root })
  return { root, api: createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }) }
}

describe('treadmill.describe', () => {
  it('answers treadmill-unavailable without the service', async () => {
    const { api } = await harness(false)
    const response = await api.treadmill.describe(request({}), signal())
    expect(response.result).toMatchObject({ ok: false, error: { code: 'treadmill-unavailable' } })
  })

  it('describes the seeded installation', async () => {
    const { api, root } = await harness(true)
    const response = await api.treadmill.describe(request({}), signal())
    expect(response.result.ok).toBe(true)
    if (!response.result.ok) return
    expect(response.result.value.root).toBe(root)
    expect(response.result.value.enabled).toBe(true)
    expect(response.result.value.stages.map(stage => stage.id)).toContain('10a')
    expect(response.result.value.files.some(file => file.path === 'esteira/pipeline.yaml')).toBe(true)
  })
})

describe('treadmill.readFile and treadmill.writeFile', () => {
  it('round-trips an edit and reflects it in the next describe', async () => {
    const { api } = await harness(true)
    const read = await api.treadmill.readFile(request({ path: 'esteira/pipeline.yaml' }), signal())
    expect(read.result.ok).toBe(true)
    if (!read.result.ok) return
    const edited = read.result.value.content.replace('label: Deploy\n', 'label: Ship\n')
    const write = await api.treadmill.writeFile(request({ path: 'esteira/pipeline.yaml', content: edited }), signal())
    expect(write.result).toMatchObject({ ok: true, value: { path: 'esteira/pipeline.yaml' } })
    const after = await api.treadmill.describe(request({}), signal())
    if (!after.result.ok) throw new Error('describe failed')
    expect(after.result.value.stages.find(stage => stage.id === 'deploy')?.label).toBe('Ship')
  })

  it('refuses paths outside the root and reports missing files', async () => {
    const { api } = await harness(true)
    expect((await api.treadmill.readFile(request({ path: '../secrets' }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-denied' } })
    expect((await api.treadmill.writeFile(request({ path: '/tmp/x', content: '' }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-denied' } })
    expect((await api.treadmill.readFile(request({ path: 'rules/absent.md' }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-not-found' } })
    const absent = await harness(false)
    expect((await absent.api.treadmill.readFile(request({ path: 'x' }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-unavailable' } })
    expect((await absent.api.treadmill.writeFile(request({ path: 'x', content: '' }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-unavailable' } })
  })
})
