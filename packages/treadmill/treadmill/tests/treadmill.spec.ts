import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import Treadmill, { parsePipeline, PIPELINE_FILE, TreadmillError, TREADMILL_ASSETS } from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'

const TREADMILL_SKILLS = [
  'arquitetura', 'deploy', 'desenvolvimento', 'discovery', 'qa', 'qa-rpa', 'redteam', 'review-codigo-subagents', 'scaffold-spec', 'seguranca',
]
const COMMAND_SKILLS = ['check-rules', 'dead-code-cleansing', 'refactor', 'responsive-pass', 'tick-esteira']

async function boot(root: string) {
  const ctx = new Context()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(SkillRegistry)
  await ctx.plugin(Treadmill, { root })
  return ctx
}

describe('dsh-treadmill plugin', () => {
  it('declares stable plugin metadata and the vendored assets', () => {
    expect(Treadmill.inject).toEqual(['skills', 'agents'])
    expect(Invariant.name).toBe('treadmill-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
    expect(TREADMILL_ASSETS.endsWith('/assets/opennjord/')).toBe(true)
  })

  it('seeds an editable root once and serves every skill and command to a project without its own copy', async () => {
    const root = join(await mkdtemp(join(tmpdir(), 'dsh-treadmill-')), 'install')
    const project = await mkdtemp(join(tmpdir(), 'dsh-treadmill-project-'))
    const ctx = await boot(root)
    const description = await ctx.treadmill.describe()
    expect(description).toMatchObject({ root, enabled: true })
    expect(description.stages.map(stage => stage.id)).toEqual([
      '00-discovery', 'plano', '00s', '10a', '20', '25', '10b', '30-qa-rpa', '30-qa', '40-redteam', '40-seguranca', 'deploy',
    ])
    expect(description.files.map(file => file.category)).toEqual(expect.arrayContaining(['skills', 'rules', 'commands', 'tools', 'esteira']))
    const names = new Set((await ctx.skills.list({ cwd: project })).map(skill => skill.name))
    for (const name of [...TREADMILL_SKILLS, ...COMMAND_SKILLS]) expect(names.has(name), name).toBe(true)
    const scaffold = await ctx.skills.get('scaffold-spec', { cwd: project })
    expect(scaffold?.provider).toBe('treadmill')
    expect(scaffold?.content).toContain('Edição DeepSeek Harness')
    expect(ctx.treadmill.promptText()).toContain(root)
    expect(ctx.treadmill.promptText()).toContain('01-file-size.md')
  })

  it('keeps edits across a reseed and refuses paths outside the root', async () => {
    const root = join(await mkdtemp(join(tmpdir(), 'dsh-treadmill-')), 'install')
    const first = await boot(root)
    await first.treadmill.writeFile('rules/eng/99-local.md', '# Local rule\n')
    await first.treadmill.writeFile('skills/discovery/SKILL.md', '---\nname: discovery\ndescription: edited\n---\nEdited.\n')
    const second = await boot(root)
    expect(await second.treadmill.readFile('rules/eng/99-local.md')).toBe('# Local rule\n')
    expect(second.treadmill.promptText()).toContain('99-local.md — Local rule')
    expect((await second.skills.list({ cwd: root })).find(skill => skill.name === 'discovery')?.description).toBe('edited')
    await expect(second.treadmill.readFile('../outside.md')).rejects.toBeInstanceOf(TreadmillError)
    await expect(second.treadmill.readFile('/etc/passwd')).rejects.toMatchObject({ code: 'denied' })
    await expect(second.treadmill.readFile('rules/missing.md')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('projects an edited stage table and reports a broken one without losing the files', async () => {
    const root = join(await mkdtemp(join(tmpdir(), 'dsh-treadmill-')), 'install')
    const ctx = await boot(root)
    const table = await ctx.treadmill.readFile(PIPELINE_FILE)
    await ctx.treadmill.writeFile(PIPELINE_FILE, table.replace('  - id: deploy\n', '  - id: docs\n    label: Docs\n    section: Docs\n    skill: discovery\n    gate: auto\n  - id: deploy\n'))
    expect((await ctx.treadmill.stages()).stages.map(stage => stage.id)).toContain('docs')
    await writeFile(join(root, PIPELINE_FILE), 'schema: 1\nstages: [{ id: a, label: A, section: S, skill: x }, { id: a, label: B, section: S, skill: y }]\n')
    const broken = await ctx.treadmill.describe()
    expect(broken.stages).toEqual([])
    expect(broken.pipelineError).toContain('duplicate stage id')
    expect(await readFile(join(root, 'skills/discovery/SKILL.md'), 'utf8')).toContain('name: discovery')
    expect(() => parsePipeline('schema: 1\nstages: []\n')).not.toThrow()
  })

  it('serves nothing and says so while disabled', async () => {
    const root = join(await mkdtemp(join(tmpdir(), 'dsh-treadmill-')), 'install')
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(Treadmill, { root, enabled: false })
    expect((await ctx.treadmill.describe()).enabled).toBe(false)
    expect(await ctx.skills.list({ cwd: root })).toEqual([])
    expect(ctx.treadmill.promptText()).toBe('')
  })

  it('registers the invariant companion without a runtime check', async () => {
    const registered: string[] = []
    const ctx = { invariants: { register: (name: string) => { registered.push(name); return () => {} } } } as never
    const dispose = await Invariant.apply(ctx)
    expect(typeof dispose).toBe('function')
    expect(registered).toEqual(['@deepseek-ai/dsh-treadmill'])
  })
})
