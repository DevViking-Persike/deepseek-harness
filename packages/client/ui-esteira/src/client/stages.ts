/** Canonical OpenNjord process stages and the pure projection of a cursor onto them. */

/** Stage identifiers of the canonical `esteira-skill-native` process, in execution order. */
export type StageId =
  | '00-discovery' | 'plano' | '00s' | '10a' | '20' | '25' | '10b'
  | '30-qa-rpa' | '30-qa' | '40-redteam' | '40-seguranca' | 'deploy'
/** Section identifiers that group stages in the graph. */
export type SectionId = 'discovery' | 'sprint' | 'architecture' | 'development' | 'review' | 'qa' | 'security' | 'deploy'
/** Projected state of one stage relative to the cursor. */
export type StageStatus = 'pending' | 'running' | 'awaiting-user' | 'awaiting-gate' | 'done' | 'error'
/** Projected state of the whole pipeline. */
export type PipelineStatus = 'running' | 'awaiting-user' | 'awaiting-gate' | 'done' | 'failed'

/** Static description of one stage: which Skill runs it and what it produces. */
export interface StageSpec {
  readonly id: StageId
  readonly section: SectionId
  /** Skill slug invoked as `/<skill>`; `args` follows the slug when present. */
  readonly skill: string
  readonly args?: string
  /** `gated` stages stop for a human decision before the process advances. */
  readonly gate: 'gated' | 'auto'
  readonly emitsVerdict: boolean
  /** Project directories the stage writes, relative to the project root. */
  readonly produces: readonly string[]
}

/** The twelve canonical stages, mirroring the OpenNjord process contract. */
export const STAGES: readonly StageSpec[] = [
  { id: '00-discovery', section: 'discovery', skill: 'discovery', gate: 'auto', emitsVerdict: false, produces: ['.spec/discovery', '.spec/plano'] },
  { id: 'plano', section: 'discovery', skill: 'discovery', gate: 'gated', emitsVerdict: false, produces: ['.spec/plano'] },
  { id: '00s', section: 'sprint', skill: 'discovery', args: 'sprint', gate: 'auto', emitsVerdict: false, produces: ['.spec/sprints'] },
  { id: '10a', section: 'architecture', skill: 'arquitetura', args: 'design', gate: 'gated', emitsVerdict: false, produces: ['.spec/arquitetura'] },
  { id: '20', section: 'development', skill: 'desenvolvimento', gate: 'auto', emitsVerdict: false, produces: ['.spec/sprints'] },
  { id: '25', section: 'review', skill: 'review-codigo-subagents', gate: 'auto', emitsVerdict: true, produces: ['.spec/sprints'] },
  { id: '10b', section: 'architecture', skill: 'arquitetura', args: 'review', gate: 'auto', emitsVerdict: true, produces: ['.spec/arquitetura'] },
  { id: '30-qa-rpa', section: 'qa', skill: 'qa-rpa', gate: 'auto', emitsVerdict: true, produces: ['.spec/qa'] },
  { id: '30-qa', section: 'qa', skill: 'qa', gate: 'auto', emitsVerdict: true, produces: ['.spec/qa'] },
  { id: '40-redteam', section: 'security', skill: 'redteam', gate: 'auto', emitsVerdict: true, produces: ['.spec/seguranca'] },
  { id: '40-seguranca', section: 'security', skill: 'seguranca', gate: 'auto', emitsVerdict: true, produces: ['.spec/seguranca'] },
  { id: 'deploy', section: 'deploy', skill: 'deploy', gate: 'gated', emitsVerdict: false, produces: [] },
]

/** One backlog sprint as the cursor records it. */
export interface BacklogItem { readonly id: string; readonly home: string; readonly status: string }

/** The fields of `.spec/esteira-state.yaml` the view reads. Absent scalars stay `undefined`. */
export interface EsteiraCursor {
  schema?: number | undefined
  plan?: string | undefined
  activeSprint?: string | undefined
  stage?: string | undefined
  attempt?: number | undefined
  verdict?: string | null | undefined
  updatedAt?: string | undefined
  runId?: string | undefined
  revision?: number | undefined
  backlog: readonly BacklogItem[]
}

function scalar(text: string, key: string): string | undefined {
  const match = text.match(new RegExp(`^${key}:\\s*(?:"([^"]*)"|'([^']*)'|([^#\\n]+))`, 'm'))
  return (match?.[1] ?? match?.[2] ?? match?.[3])?.trim()
}
function numberScalar(text: string, key: string): number | undefined {
  const value = scalar(text, key)
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Parse the cursor file. The file is hand-maintained YAML with a flat scalar
 * header and a `backlog` list; only those parts are read.
 * @param text - raw file content.
 * @returns the parsed cursor.
 */
export function parseCursor(text: string): EsteiraCursor {
  const backlogStart = text.search(/^backlog:\s*$/m)
  const tail = backlogStart < 0 ? '' : text.slice(backlogStart)
  const backlog = [...tail.matchAll(/^\s*- id:\s*(\S+)\s*\n\s*home:\s*(\S+)\s*\n\s*status:\s*(\S+)/gm)]
    .map(match => ({ id: match[1] ?? '', home: match[2] ?? '', status: match[3] ?? '' }))
  const verdict = scalar(text, 'veredito')
  return {
    schema: numberScalar(text, 'schema'), plan: scalar(text, 'plano'), activeSprint: scalar(text, 'sprint_ativa'),
    stage: scalar(text, 'etapa'), attempt: numberScalar(text, 'tentativa'), verdict: verdict === 'null' ? null : verdict,
    updatedAt: scalar(text, 'atualizado'), runId: scalar(text, 'run_id'), revision: numberScalar(text, 'revision'), backlog,
  }
}

/** A stage with its projected status. */
export interface StageView extends StageSpec {
  readonly index: number
  readonly status: StageStatus
  readonly current: boolean
}

/**
 * Project the cursor onto the canonical stages. Stages before the cursor are
 * done, the cursor's stage reflects the Session and the verdict, later stages
 * are pending; a cursor at `done` or at an unknown stage marks everything done.
 * @param cursor - parsed cursor.
 * @param running - whether the current Session has a turn in flight.
 * @returns every stage in order with its status.
 */
export function projectStages(cursor: EsteiraCursor, running: boolean): StageView[] {
  const currentIndex = STAGES.findIndex(stage => stage.id === cursor.stage)
  const rejected = typeof cursor.verdict === 'string' && /^reprov/i.test(cursor.verdict)
  return STAGES.map((spec, index) => {
    const current = index === currentIndex
    const status: StageStatus = currentIndex < 0 || index < currentIndex ? 'done'
      : !current ? 'pending'
        : running ? 'running'
          : rejected ? 'error'
            : spec.gate === 'gated' ? 'awaiting-gate' : 'awaiting-user'
    return { ...spec, index, status, current }
  })
}

/**
 * Fold stage statuses into one pipeline status.
 * @param stages - projected stages.
 * @returns the pipeline status.
 */
export function pipelineStatus(stages: readonly StageView[]): PipelineStatus {
  const current = stages.find(stage => stage.current)
  if (current === undefined) return 'done'
  switch (current.status) {
    case 'running': return 'running'
    case 'error': return 'failed'
    case 'awaiting-gate': return 'awaiting-gate'
    default: return 'awaiting-user'
  }
}

/**
 * The slash command that invokes one stage's Skill, with the active sprint
 * substituted into a `sprint` argument and the argument dropped when unknown.
 * @param spec - stage to run.
 * @param cursor - parsed cursor, for the active sprint.
 * @returns the command, for example `/arquitetura design`.
 */
export function stageCommand(spec: StageSpec, cursor: EsteiraCursor): string {
  const args = spec.args === undefined ? ''
    : spec.args === 'sprint' ? (cursor.activeSprint === undefined ? '' : ` sprint ${cursor.activeSprint}`)
      : ` ${spec.args}`
  return `/${spec.skill}${args}`
}

/**
 * Build the prompt that runs one stage through its installed Skill.
 * @param spec - stage to run.
 * @param cursor - parsed cursor, for the active sprint.
 * @returns the prompt text.
 */
export function stagePrompt(spec: StageSpec, cursor: EsteiraCursor): string {
  return `${stageCommand(spec, cursor)} Execute somente a etapa ${spec.id} da Esteira OpenNjord para o cursor .spec/esteira-state.yaml. `
    + 'Use as Skills instaladas e preserve todos os gates, artefatos, receipts e paradas humanas do método. '
    + 'Não avance outra etapa e não declare conclusão sem validar os artefatos canônicos.'
}

/** The prompt that installs the Esteira into a project that has no cursor yet. */
export const INSTALL_PROMPT = '/scaffold-spec criar Instale a Esteira OpenNjord neste projeto criando somente .spec/ '
  + '(MANIFEST.md, STATE.md, esteira-state.yaml, sprints/README.md, sprints/RUNBOOK.md, reference/README.md) e docs/adrs/. '
  + 'As skills, rules, commands e agents já vêm do DeepSeek Harness: não crie .opennjord/, .claude/, .codex/, .agents/, '
  + 'symlinks nem CLAUDE.md roteador. Não sobrescreva arquivos existentes sem confirmar.'
