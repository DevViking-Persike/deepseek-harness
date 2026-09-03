import { describe, expect, it } from 'vitest'
import { parseCursor, pipelineStatus, projectStages, runnableStage, STAGES, stageCommand, stagePrompt } from '../src/client/stages.ts'

const CURSOR = `# comment
schema: 2
plano: discovery/plano-de-sprints-46.md
sprint_ativa: 46-10
etapa: "00s"
tentativa: 1
veredito: null
atualizado: 2026-08-16T10:20:00Z
run_id: run-46
revision: 264

backlog:
  - id: 46-01
    home: .spec/sprints/sprint-46-01
    status: done
  - id: 46-10
    home: .spec/sprints/sprint-46-10
    status: pending
tasks: []
`

describe('parseCursor', () => {
  it('reads the scalar header and the backlog list', () => {
    expect(parseCursor(CURSOR)).toEqual({
      schema: 2, plan: 'discovery/plano-de-sprints-46.md', activeSprint: '46-10', stage: '00s', attempt: 1, verdict: null,
      updatedAt: '2026-08-16T10:20:00Z', runId: 'run-46', revision: 264,
      backlog: [
        { id: '46-01', home: '.spec/sprints/sprint-46-01', status: 'done' },
        { id: '46-10', home: '.spec/sprints/sprint-46-10', status: 'pending' },
      ],
    })
  })
  it('leaves absent or non-numeric scalars undefined and tolerates a missing backlog', () => {
    expect(parseCursor("etapa: '10a'\nrevision: many\nveredito: APROVADO\n")).toEqual({
      schema: undefined, plan: undefined, activeSprint: undefined, stage: '10a', attempt: undefined, verdict: 'APROVADO',
      updatedAt: undefined, runId: undefined, revision: undefined, backlog: [],
    })
  })
})

describe('projectStages', () => {
  const cursor = parseCursor(CURSOR)
  it('marks earlier stages done, the cursor stage waiting, and later stages pending', () => {
    const stages = projectStages(cursor, false)
    expect(stages.map(stage => stage.status)).toEqual([
      'done', 'done', 'awaiting-user', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending', 'pending',
    ])
    expect(stages.find(stage => stage.current)?.id).toBe('00s')
    expect(pipelineStatus(stages)).toBe('awaiting-user')
  })
  it('shows the cursor stage running while the Session has a turn in flight', () => {
    const stages = projectStages(cursor, true)
    expect(stages[2]?.status).toBe('running')
    expect(pipelineStatus(stages)).toBe('running')
  })
  it('reads a gated stage as awaiting its gate and a rejection as an error', () => {
    expect(projectStages({ ...cursor, stage: '10a' }, false)[3]?.status).toBe('awaiting-gate')
    expect(pipelineStatus(projectStages({ ...cursor, stage: '10a' }, false))).toBe('awaiting-gate')
    const rejected = projectStages({ ...cursor, stage: '25', verdict: 'REPROVADO' }, false)
    expect(rejected[5]?.status).toBe('error')
    expect(pipelineStatus(rejected)).toBe('failed')
  })
  it('marks every stage done when the cursor is past the process', () => {
    const stages = projectStages({ ...cursor, stage: 'done' }, false)
    expect(stages.every(stage => stage.status === 'done')).toBe(true)
    expect(pipelineStatus(stages)).toBe('done')
  })
})

describe('stagePrompt', () => {
  const cursor = parseCursor(CURSOR)
  const spec = (id: string) => {
    const found = STAGES.find(stage => stage.id === id)
    if (found === undefined) throw new Error(id)
    return found
  }
  it('invokes the Skill with its fixed arguments', () => {
    expect(stageCommand(spec('10b'), cursor)).toBe('/arquitetura review')
    expect(stagePrompt(spec('10a'), cursor)).toMatch(/^\/arquitetura design Execute somente a etapa 10a /)
    expect(stagePrompt(spec('20'), cursor)).toMatch(/^\/desenvolvimento Execute somente a etapa 20 /)
  })
  it('passes the active sprint to the sprint discovery and omits it when unknown', () => {
    expect(stagePrompt(spec('00s'), cursor)).toMatch(/^\/discovery sprint 46-10 /)
    expect(stagePrompt(spec('00s'), { ...cursor, activeSprint: undefined })).toMatch(/^\/discovery Execute/)
  })
})

describe('disabled stages', () => {
  const cursor = parseCursor(CURSOR)
  const table = STAGES.map(stage => stage.id === '40-redteam' || stage.id === 'deploy' ? { ...stage, enabled: false } : stage)

  it('shows a disabled stage as skipped wherever it sits and counts it as progress', () => {
    const stages = projectStages(cursor, false, table)
    expect(stages.find(stage => stage.id === '40-redteam')?.status).toBe('skipped')
    expect(stages.find(stage => stage.id === 'deploy')?.status).toBe('skipped')
    expect(runnableStage(stages)?.id).toBe('00s')
    expect(pipelineStatus(projectStages({ ...cursor, stage: '40-seguranca' }, false, table))).toBe('awaiting-gate')
  })

  it('runs the next enabled stage when the cursor sits on a disabled one and says so in the prompt', () => {
    const stages = projectStages({ ...cursor, stage: '40-redteam' }, false, table)
    expect(stages.find(stage => stage.current)?.status).toBe('skipped')
    const next = runnableStage(stages)
    expect(next?.id).toBe('40-seguranca')
    if (next === undefined) throw new Error('no runnable stage')
    const prompt = stagePrompt(next, { ...cursor, stage: '40-redteam' }, table)
    expect(prompt).toContain('O cursor está em 40-redteam, que está desligada: avance-o para 40-seguranca sem executar 40-redteam.')
    expect(prompt).toContain('As etapas 40-redteam, deploy estão DESLIGADAS')
    expect(runnableStage(projectStages({ ...cursor, stage: 'deploy' }, false, table))).toBeUndefined()
  })

  it('keeps the prompt free of skip clauses when every stage is enabled', () => {
    const spec = STAGES[0]
    if (spec === undefined) throw new Error('no stage')
    expect(stagePrompt(spec, cursor)).not.toContain('DESLIGADAS')
  })
})

describe('a run started from a disabled cursor stage', () => {
  const cursor = { ...parseCursor(CURSOR), stage: '10a' }
  const table = STAGES.map(stage => stage.id === '10a' ? { ...stage, enabled: false } : stage)

  it('shows the next enabled stage as running until the Skill moves the cursor', () => {
    const stages = projectStages(cursor, true, table)
    expect(stages.find(stage => stage.id === '10a')?.status).toBe('skipped')
    expect(stages.find(stage => stage.id === '20')?.status).toBe('running')
    expect(stages.find(stage => stage.id === '25')?.status).toBe('pending')
    expect(pipelineStatus(stages)).toBe('running')
    const idle = projectStages(cursor, false, table)
    expect(idle.find(stage => stage.id === '20')?.status).toBe('pending')
    expect(runnableStage(idle)?.id).toBe('20')
  })
})
