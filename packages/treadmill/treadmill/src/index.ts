/**
 * OpenNjord Treadmill installation owned by the harness.
 *
 * The package vendors the complete `.opennjord` installation (skills, rules,
 * commands, agents, integrations, tools, and the `esteira/pipeline.yaml` stage
 * table) under `assets/opennjord`. On first use it copies that tree into an
 * editable root (`<dshHome>/opennjord` by default) and from then on serves the
 * root: its `skills` and `commands` directories become one filesystem Skill
 * provider for every project, its rules index and tool paths become one
 * system-prompt section per agent, and its files are readable and writable
 * through the `ctx.opennjord` service so a client can edit them in place.
 *
 * A project therefore keeps no `.opennjord`, `.claude`, or `.codex` copy: the
 * harness owns the method, the project owns `.spec/` and `docs/adrs/`.
 *
 * The `opennjord` user-settings section carries one `enabled` switch. Off, the
 * provider serves no skill, the prompt section is empty, and `describe()`
 * reports the state so clients hide their Treadmill surfaces.
 *
 * @module @deepseek-ai/dsh-treadmill
 */

import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Service, type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { isMap, isSeq, parse as parseYaml, parseDocument } from 'yaml'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SkillCandidate, SkillLookupOptions, SkillProvider } from '@deepseek-ai/dsh-skill'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'

/** Provider name under which the installation's skills and commands register. */
export const PROVIDER_NAME = 'treadmill'
/** Absolute path of the vendored `.opennjord` installation the editable root is seeded from. */
export const TREADMILL_ASSETS = fileURLToPath(new URL('../assets/opennjord/', import.meta.url))
/** Relative path, inside the root, of the editable stage table. */
export const PIPELINE_FILE = 'esteira/pipeline.yaml'
/** Prompt order of the rules section: after tool guidance, before contexts. */
const PROMPT_ORDER = 150
const NS = settingsNamespace('treadmill')

/** Plugin configuration. */
export interface Config {
  /** Editable installation root. Defaults to `<dshHome>/opennjord`. */
  root?: string
  /** Whether the Treadmill is served; the `opennjord.enabled` user setting layers over it. */
  enabled?: boolean
}
/** Plugin configuration schema. */
export const Config: Schema<Config> = z.object({
  root: z.string(),
  enabled: z.boolean().default(true),
})

/** The `opennjord` user-settings section. */
export interface TreadmillSettings {
  enabled: boolean
}
const SettingsSchema: Schema<TreadmillSettings> = z.object({ enabled: z.boolean().default(true) })

/** One stage of the Treadmill as `esteira/pipeline.yaml` declares it. */
export interface TreadmillStage {
  readonly id: string
  readonly label: string
  readonly section: string
  /** Skill slug invoked as `/<skill>`; `args` follows it, and `sprint` receives the active sprint. */
  readonly skill: string
  readonly args?: string
  /** `manual` stages stop for a human decision before the process advances. */
  readonly gate: 'manual' | 'auto'
  readonly verdict: boolean
  /** A disabled stage stays in the table but is skipped: the cursor advances past it. */
  readonly enabled: boolean
  /** Project directories the stage writes, relative to the project root. */
  readonly produces: readonly string[]
}

/** One file of the installation, relative to the root. */
export interface TreadmillFile {
  readonly path: string
  /** First path segment: `skills`, `rules`, `commands`, `agents`, `tools`, `integrations`, or `esteira`. */
  readonly category: string
  readonly size: number
}

/** The installation as clients see it. */
export interface TreadmillDescription {
  readonly root: string
  readonly enabled: boolean
  readonly stages: readonly TreadmillStage[]
  /** Set when `esteira/pipeline.yaml` is unreadable or invalid; `stages` is then empty. */
  readonly pipelineError?: string
  readonly files: readonly TreadmillFile[]
}

/** Failure of a file operation inside the installation root. */
export class TreadmillError extends Error {
  constructor(readonly code: 'denied' | 'not-found', message: string) {
    super(message)
    this.name = 'TreadmillError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    treadmill: TreadmillService
  }
}

const StageSchema = z.object({
  id: z.string().required(),
  label: z.string().required(),
  section: z.string().required(),
  skill: z.string().required(),
  args: z.string().default(''),
  gate: z.union(['manual', 'auto'] as const).default('auto'),
  verdict: z.boolean().default(false),
  produces: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
})
const PipelineSchema = z.object({
  schema: z.number().required(),
  stages: z.array(StageSchema).required(),
})

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Parse the stage table. Ids must be unique; `args` is omitted when blank.
 * @param text - `esteira/pipeline.yaml` content.
 * @returns the stages in file order.
 */
export function parsePipeline(text: string): TreadmillStage[] {
  const raw: unknown = parseYaml(text)
  const parsed = PipelineSchema(raw as Parameters<typeof PipelineSchema>[0])
  const seen = new Set<string>()
  return parsed.stages.map((stage) => {
    const id = stage.id
    if (seen.has(id)) throw new Error(`duplicate stage id "${id}"`)
    seen.add(id)
    return {
      id, label: stage.label, section: stage.section, skill: stage.skill,
      ...stage.args.length === 0 ? {} : { args: stage.args },
      gate: stage.gate, verdict: stage.verdict, produces: stage.produces, enabled: stage.enabled,
    }
  })
}

/** The switches of one stage a client may flip without editing the table by hand. */
export interface StagePatch {
  readonly enabled?: boolean
  readonly gate?: 'manual' | 'auto'
}

/**
 * Update one stage's switches in a stage table's YAML text, keeping comments
 * and layout. Shared by the harness default table and a project's own copy.
 * @param text - `pipeline.yaml` or `.spec/treadmill.yaml` content.
 * @param id - stage id as the table lists it.
 * @param patch - the switches to set; an absent field keeps its value.
 * @returns the rewritten YAML.
 * @throws TreadmillError `not-found` when the table lists no such stage.
 */
export function updateStageInTable(text: string, id: string, patch: StagePatch): string {
  const document = parseDocument(text)
  const stages = document.get('stages')
  const stage = isSeq(stages)
    ? stages.items.find(item => isMap(item) && String(item.get('id')) === id)
    : undefined
  if (stage === undefined || !isMap(stage)) throw new TreadmillError('not-found', `stage "${id}" is not in the stage table`)
  if (patch.enabled !== undefined) stage.set('enabled', patch.enabled)
  if (patch.gate !== undefined) stage.set('gate', patch.gate)
  return document.toString()
}

/** Host-owned installation: seeding, file access, stage table, and the rules index. */
export class TreadmillService extends Service {
  static inject = ['skills', 'agents']
  static Config = Config

  /** Editable installation root. */
  readonly root: string
  private enabledByConfig: boolean
  private settings: () => TreadmillSettings
  private invalidate: (() => void) | undefined
  private provider: FileSystemSkillProvider | undefined
  private rulesIndex = ''
  /** Seeding and the first rules index; every file operation waits for it. */
  private readonly ready: Promise<void>
  private readonly promptFibers = new Map<Agent, ReturnType<Context['inject']>>()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'treadmill')
    this.root = resolve(config.root ?? join(resolveDshHome(), 'treadmill'))
    this.enabledByConfig = config.enabled ?? true
    this.settings = () => ({ enabled: this.enabledByConfig })
    this.ready = this.seed().then(() => this.refreshRulesIndex())
    installSettingsSection(ctx, NS, SettingsSchema, { enabled: this.enabledByConfig }, {
      setSource: (source) => { this.settings = source },
      onChange: () => { this.invalidate?.() },
    })
    ctx.skills.registerProvider((control) => {
      this.invalidate = control.invalidate
      this.provider = new FileSystemSkillProvider(ctx, control, {
        providerName: PROVIDER_NAME,
        includeDefaultRoots: false,
        customSkillDirs: [join(this.root, 'skills'), join(this.root, 'commands')],
        watch: false,
      })
      return this.gated(this.provider)
    })
    ctx.effect(function* (this: TreadmillService) {
      yield async () => { await this.provider?.dispose() }
    }.bind(this), 'treadmill provider')
    const installPrompt = (agent: Agent): void => {
      if (this.promptFibers.has(agent)) return
      this.promptFibers.set(agent, agent.ctx.inject(['systemPrompt'], (scope) => {
        scope.systemPrompt.section({ name: 'treadmill:rules', order: PROMPT_ORDER, text: () => this.promptText() })
      }))
    }
    for (const agent of ctx.agents.list()) installPrompt(agent)
    ctx.on('agent/created', ({ agent }) => { installPrompt(agent) })
    ctx.on('agent/disposed', ({ agent }) => {
      const fiber = this.promptFibers.get(agent)
      this.promptFibers.delete(agent)
      void fiber?.dispose().catch((error: unknown) => {
        ctx.logger.warn(`treadmill: prompt cleanup failed: ${describeError(error)}`)
      })
    })
  }

  /**
   * Whether the Treadmill is served: the composition default gated by the user setting.
   * @returns `true` while skills and the prompt section are served.
   */
  enabled(): boolean {
    return this.settings().enabled
  }

  /**
   * Copy what the vendored installation has and the root lacks: every
   * top-level category, and inside an existing category every direct child
   * (a skill directory, a rule file, a command). Existing entries are never
   * overwritten, so edits survive updates while a new skill still arrives.
   */
  private async seed(): Promise<void> {
    await mkdir(this.root, { recursive: true })
    for (const entry of await readdir(TREADMILL_ASSETS, { withFileTypes: true })) {
      const source = join(TREADMILL_ASSETS, entry.name)
      const target = join(this.root, entry.name)
      if (!await this.copyMissing(source, target)) continue
      if (!entry.isDirectory()) continue
      for (const child of await readdir(source)) await this.copyMissing(join(source, child), join(target, child))
    }
  }

  /** Copy `source` to `target` unless `target` exists; `true` when it already existed. */
  private async copyMissing(source: string, target: string): Promise<boolean> {
    const present = await stat(target).then(() => true, () => false)
    if (!present) await cp(source, target, { recursive: true })
    return present
  }

  private gated(inner: SkillProvider): SkillProvider {
    return {
      name: inner.name,
      list: async (options: SkillLookupOptions) => {
        await this.ready
        return this.enabled() ? inner.list(options) : []
      },
      get: (candidate: SkillCandidate, options: SkillLookupOptions) => inner.get(candidate, options),
    }
  }

  /**
   * Resolve one installation-relative path, refusing anything that would
   * leave the root.
   * @param path - relative path as a client sent it.
   * @returns the absolute path inside the root.
   */
  private target(path: string): string {
    const clean = normalize(path)
    if (isAbsolute(clean) || clean === '.' || clean.startsWith('..')) {
      throw new TreadmillError('denied', `"${path}" is outside the OpenNjord installation`)
    }
    const absolute = resolve(this.root, clean)
    if (!absolute.startsWith(this.root + sep)) throw new TreadmillError('denied', `"${path}" is outside the OpenNjord installation`)
    return absolute
  }

  /**
   * Read one installation file.
   * @param path - path relative to the root.
   * @returns the file text.
   */
  async readFile(path: string): Promise<string> {
    await this.ready
    try {
      return await readFile(this.target(path), 'utf8')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new TreadmillError('not-found', `"${path}" does not exist`)
      throw error
    }
  }

  /**
   * Write one installation file, creating parent directories, then refresh
   * the skill catalog and the rules index.
   * @param path - path relative to the root.
   * @param content - new text.
   */
  async writeFile(path: string, content: string): Promise<void> {
    await this.ready
    const absolute = this.target(path)
    await mkdir(resolve(absolute, '..'), { recursive: true })
    await writeFile(absolute, content, 'utf8')
    await this.refreshRulesIndex()
    this.invalidate?.()
  }

  /**
   * Update one stage's switches in `esteira/pipeline.yaml`, keeping the file's
   * comments and layout. A disabled stage stays listed and is skipped; a
   * `manual` gate waits for the run action, an `auto` gate follows through.
   * @param id - stage id as the table lists it.
   * @param patch - the switches to set.
   */
  async updateStage(id: string, patch: StagePatch): Promise<void> {
    await this.writeFile(PIPELINE_FILE, updateStageInTable(await this.readFile(PIPELINE_FILE), id, patch))
  }

  /**
   * The stage table, parsed from `esteira/pipeline.yaml`.
   * @returns the stages, or the parse failure.
   */
  async stages(): Promise<{ stages: TreadmillStage[]; error?: string }> {
    try {
      return { stages: parsePipeline(await this.readFile(PIPELINE_FILE)) }
    } catch (error: unknown) {
      return { stages: [], error: describeError(error) }
    }
  }

  /**
   * Describe the installation: root, enabled state, stages, and every file.
   * @returns the description.
   */
  async describe(): Promise<TreadmillDescription> {
    await this.ready
    const [{ stages, error }, files] = await Promise.all([this.stages(), this.files()])
    return {
      root: this.root, enabled: this.enabled(), stages, files,
      ...error === undefined ? {} : { pipelineError: error },
    }
  }

  private async files(): Promise<TreadmillFile[]> {
    const result: TreadmillFile[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const absolute = join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(absolute)
        } else if (entry.isFile()) {
          const path = relative(this.root, absolute).split(sep).join('/')
          result.push({ path, category: path.split('/')[0] ?? '', size: (await stat(absolute)).size })
        }
      }
    }
    await walk(this.root)
    return result
  }

  private async refreshRulesIndex(): Promise<void> {
    const lines: string[] = []
    const rules = join(this.root, 'rules')
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        const absolute = join(dir, entry.name)
        if (entry.isDirectory()) await walk(absolute)
        else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_') && entry.name !== 'README.md') {
          const heading = (await readFile(absolute, 'utf8')).split('\n').find(line => line.startsWith('# '))
          lines.push(`- ${absolute}${heading === undefined ? '' : ` — ${heading.slice(2).trim()}`}`)
        }
      }
    }
    await walk(rules)
    this.rulesIndex = lines.join('\n')
  }

  /**
   * The per-agent prompt section: installation root, rules index, and tool paths.
   * @returns the section text, empty while disabled.
   */
  promptText(): string {
    if (!this.enabled()) return ''
    return [
      '## OpenNjord Treadmill',
      `The Treadmill installation lives at ${this.root} (skills, rules, commands, agents, tools). It is not copied into projects: a project owns only .spec/ (cursor, discovery, sprints, tasks, evidence) and docs/adrs/ (ADRs).`,
      'Engineering rules apply to every change. Read the ones relevant to the task before editing:',
      this.rulesIndex,
      `Validation tools: ${join(this.root, 'tools')}/spec-check.sh and esteira-check.sh; run them with bash from the project root.`,
    ].filter(part => part.length > 0).join('\n')
  }
}

/** Cordis plugin name. */
export const name = 'treadmill'

export default TreadmillService
