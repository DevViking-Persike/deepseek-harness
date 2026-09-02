import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillOpenNjord from '../src/index.ts'
import * as Invariant from '../src/invariant.ts'

const ESTEIRA_SKILLS = [
  'arquitetura', 'deploy', 'desenvolvimento', 'discovery', 'qa', 'qa-rpa', 'redteam', 'review-codigo-subagents', 'scaffold-spec', 'seguranca',
]

describe('dsh-skill-opennjord plugin', () => {
  it('declares stable plugin metadata and the vendored paths', () => {
    expect(SkillOpenNjord.name).toBe('skill-opennjord')
    expect(SkillOpenNjord.inject).toEqual(['skills'])
    expect(Invariant.name).toBe('skill-opennjord-invariant')
    expect(Invariant.inject).toEqual(['invariants'])
    expect(SkillOpenNjord.OPENNJORD_SKILLS_DIR.startsWith(SkillOpenNjord.OPENNJORD_ROOT)).toBe(true)
  })

  it('serves every Esteira skill to a project that has no installation of its own', async () => {
    const project = await mkdtemp(join(tmpdir(), 'dsh-opennjord-'))
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    await ctx.plugin(SkillOpenNjord)
    const skills = await ctx.skills.list({ cwd: project })
    const byName = new Map(skills.map(skill => [skill.name, skill]))
    for (const name of ESTEIRA_SKILLS) {
      expect(byName.get(name), name).toMatchObject({ provider: SkillOpenNjord.PROVIDER_NAME, source: 'custom' })
    }
    const scaffold = await ctx.skills.get('scaffold-spec', { cwd: project })
    expect(scaffold?.content).toContain('Edição DeepSeek Harness')
  })

  it('registers the invariant companion without a runtime check', async () => {
    const registered: string[] = []
    const ctx = { invariants: { register: (name: string) => { registered.push(name); return () => {} } } } as never
    const dispose = await Invariant.apply(ctx)
    expect(typeof dispose).toBe('function')
    expect(registered).toEqual(['@deepseek-ai/dsh-skill-opennjord'])
  })
})
