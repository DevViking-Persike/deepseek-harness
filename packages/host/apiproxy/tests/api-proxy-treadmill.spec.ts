/**
 * treadmill.* domain: the host-owned OpenNjord installation, described and
 * edited through the gateway. The service seeds a temporary root from the
 * vendored assets, so every row runs against real files.
 */
import { mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { SessionId } from '@deepseek-ai/dsh-session/types'
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

async function harness(withTreadmill: boolean, withProject = false) {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SkillRegistry)
  const root = join(mkdtempSync(join(tmpdir(), 'dsh-treadmill-spec-')), 'install')
  if (withTreadmill) await ctx.plugin(Treadmill, { root })
  // The seam realpaths every target, and macOS resolves the temp root through a symlink.
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-treadmill-project-')))
  if (withProject) {
    mkdirSync(join(project, '.spec'))
    await ctx.plugin(LocalFileSystem)
    await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: project })
    ctx.sessions.create(SessionId('s-project'), { meta: { cwd: project } })
  }
  return { root, project, api: createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: project }) }
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
    expect(response.result.value.tableSource).toBe('global')
    expect(response.result.value.stages.map(stage => stage.id)).toContain('10a')
    expect(response.result.value.stages.find(stage => stage.id === 'commit-push')?.enabled).toBe(false)
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

describe('treadmill.updateStage', () => {
  it('edits the harness default table without a session', async () => {
    const { api } = await harness(true)
    const response = await api.treadmill.updateStage(request({ id: 'deploy', enabled: false }), signal())
    expect(response.result).toMatchObject({ ok: true, value: { id: 'deploy', tableSource: 'global' } })
    const after = await api.treadmill.describe(request({}), signal())
    if (!after.result.ok) throw new Error('describe failed')
    expect(after.result.value.stages.find(stage => stage.id === 'deploy')?.enabled).toBe(false)
    expect((await api.treadmill.updateStage(request({ id: 'nope', enabled: true }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-not-found' } })
  })

  it('gives the session\'s project its own table on the first switch and reads it back', async () => {
    const { api, project } = await harness(true, true)
    const before = await api.treadmill.describe(request({ sessionId: 's-project' }), signal())
    if (!before.result.ok) throw new Error('describe failed')
    expect(before.result.value.tableSource).toBe('global')
    const response = await api.treadmill.updateStage(request({ sessionId: 's-project', id: '40-redteam', enabled: false }), signal())
    expect(response.result).toMatchObject({ ok: true, value: { id: '40-redteam', tableSource: 'project' } })
    const table = readFileSync(join(project, '.spec/treadmill.yaml'), 'utf8')
    expect(table).toContain('# pipeline.yaml')
    const after = await api.treadmill.describe(request({ sessionId: 's-project' }), signal())
    if (!after.result.ok) throw new Error('describe failed')
    expect(after.result.value.tableSource).toBe('project')
    expect(after.result.value.stages.find(stage => stage.id === '40-redteam')?.enabled).toBe(false)
    expect(after.result.value.stages.find(stage => stage.id === 'deploy')?.enabled).toBe(true)
    const global = await api.treadmill.describe(request({}), signal())
    if (!global.result.ok) throw new Error('describe failed')
    expect(global.result.value.stages.find(stage => stage.id === '40-redteam')?.enabled).toBe(true)
    // A second switch edits the project table in place.
    await api.treadmill.updateStage(request({ sessionId: 's-project', id: 'deploy', enabled: false, gate: 'auto' }), signal())
    const again = await api.treadmill.describe(request({ sessionId: 's-project' }), signal())
    if (!again.result.ok) throw new Error('describe failed')
    expect(again.result.value.stages.filter(stage => !stage.enabled).map(stage => stage.id).sort()).toEqual(['40-redteam', 'commit-push', 'deploy'])
    expect(again.result.value.stages.find(stage => stage.id === 'deploy')?.gate).toBe('auto')
  })

  it('reports a broken project table without touching the harness default', async () => {
    const { api, project } = await harness(true, true)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(project, '.spec/treadmill.yaml'), 'schema: 1\nstages: [{ id: a, label: A, section: S, skill: x }, { id: a, label: B, section: S, skill: y }]\n')
    const response = await api.treadmill.describe(request({ sessionId: 's-project' }), signal())
    if (!response.result.ok) throw new Error('describe failed')
    expect(response.result.value.tableSource).toBe('project')
    expect(response.result.value.stages).toEqual([])
    expect(response.result.value.pipelineError).toContain('.spec/treadmill.yaml')
  })
})

describe('treadmill.saveToProject', () => {
  it('copies a skill or command into the project .dsh/skills root and refuses other paths', async () => {
    const { api, project } = await harness(true, true)
    const saved = await api.treadmill.saveToProject(request({ sessionId: 's-project', path: 'skills/discovery/SKILL.md', content: '---\nname: discovery\ndescription: local\n---\n' }), signal())
    expect(saved.result).toMatchObject({ ok: true, value: { path: '.dsh/skills/discovery/SKILL.md' } })
    expect(readFileSync(join(project, '.dsh/skills/discovery/SKILL.md'), 'utf8')).toContain('description: local')
    const command = await api.treadmill.saveToProject(request({ sessionId: 's-project', path: 'commands/refactor.md', content: '---\nname: refactor\ndescription: d\n---\n' }), signal())
    expect(command.result).toMatchObject({ ok: true, value: { path: '.dsh/skills/refactor.md' } })
    expect((await api.treadmill.saveToProject(request({ sessionId: 's-project', path: 'rules/eng/01-file-size.md', content: '' }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-denied' } })
    const absent = await harness(false)
    expect((await absent.api.treadmill.saveToProject(request({ sessionId: 's', path: 'skills/a/SKILL.md', content: '' }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-unavailable' } })
    expect((await absent.api.treadmill.updateStage(request({ id: 'a', enabled: true }), signal())).result)
      .toMatchObject({ ok: false, error: { code: 'treadmill-unavailable' } })
  })
})
