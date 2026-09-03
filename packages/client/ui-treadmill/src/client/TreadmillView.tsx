/** Treadmill view: the canonical stage graph projected from the project cursor and the current Session. */
import { useEffect, useMemo, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TreadmillKey } from './locales.ts'
// Type-only: merges the tokenUsage key into SessionProjectionMap for useProjection.
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { pipelineStatus, projectStages, runnableStage, stageCommand, type TreadmillCursor, type StageSpec, type StageView } from './stages.ts'

/** The installation facts the view needs from the host. */
export interface TreadmillInstallation {
  readonly enabled: boolean
  readonly stages: readonly StageSpec[]
  /** Whether the table came from the project's `.spec/treadmill.yaml` or the harness default. */
  readonly tableSource: 'project' | 'global'
  readonly pipelineError?: string
}
import css from './TreadmillView.module.css'

/** Registration-owned operations exposed to the view. */
export interface TreadmillViewInjected {
  /** Read and parse the project cursor; `null` when the project has no cursor file. */
  loadCursor: (signal: AbortSignal) => Promise<TreadmillCursor | null>
  /** Submit one stage's Skill prompt to the Session queue. */
  runStage: (sessionId: SessionId, stage: StageSpec, cursor: TreadmillCursor) => Promise<void>
  /** Submit the scaffold prompt that creates `.spec/` and `docs/adrs/` in the project. */
  installTreadmill: (sessionId: SessionId) => Promise<void>
  /** Read the harness-owned installation: enabled state and stage table. */
  loadInstallation: (signal: AbortSignal) => Promise<TreadmillInstallation>
  /** Update one stage's switches in the project's (or the harness default) stage table. */
  updateStage: (id: string, patch: { enabled?: boolean; gate?: 'manual' | 'auto' }) => Promise<void>
  /** Follow-through for this session: automatic stages chain without the run action. */
  followThrough: { get: () => boolean; set: (enabled: boolean) => void }
}
type Props = ConvViewProps & PropsLocale<'treadmill'> & InjectFace<TreadmillViewInjected>

/** How often the cursor is re-read while a run is in flight. */
const CURSOR_POLL_MS = 5000

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
/** The built-in table has dictionary labels; an edited table carries its own. */
function stageLabel(stage: StageSpec, t: Props['t']): string {
  return stage.label ?? t(`stage.${stage.id}` as TreadmillKey)
}
function sectionLabel(stage: StageSpec, t: Props['t']): string {
  return stage.label === undefined ? t(`section.${stage.section}` as TreadmillKey) : stage.section
}

/**
 * Render the Treadmill graph, the selected-stage panel, and the sprint and usage bands.
 * @param props - conversation view props plus the injected cursor and run operations.
 * @returns the view.
 */
export function TreadmillView({
  sessionId, useSession, useProjection, loadCursor, runStage, installTreadmill, loadInstallation, updateStage, followThrough, t,
}: Props) {
  const [following, setFollowing] = useState(followThrough.get())
  const [installationGeneration, setInstallationGeneration] = useState(0)
  const session = useSession(snapshot => snapshot)
  const usage = useProjection('tokenUsage')
  const [installation, setInstallation] = useState<TreadmillInstallation | undefined>(undefined)
  useEffect(() => {
    const abort = new AbortController()
    void loadInstallation(abort.signal).then(setInstallation).catch((reason: unknown) => { setLoadError(describe(reason)) })
    return () => { abort.abort() }
  }, [loadInstallation, installationGeneration])
  const [cursor, setCursor] = useState<TreadmillCursor | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | undefined>()
  const [runError, setRunError] = useState<string | undefined>()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The cursor is re-read when a run starts or ends and, while a run is in
  // flight, every few seconds: the Skill moves the cursor mid-turn.
  useEffect(() => {
    const abort = new AbortController()
    const read = () => { void loadCursor(abort.signal).then(setCursor).catch((reason: unknown) => { setLoadError(describe(reason)) }) }
    read()
    const timer = session.running ? setInterval(read, CURSOR_POLL_MS) : undefined
    return () => {
      abort.abort()
      if (timer !== undefined) clearInterval(timer)
    }
  }, [loadCursor, session.running])
  const stages = useMemo(
    () => cursor === null || cursor === undefined || installation === undefined
      ? []
      : projectStages(cursor, session.running, installation.stages),
    [cursor, session.running, installation],
  )
  const assistants = useMemo(() => session.nodes.filter(node => node.kind === 'assistant'), [session.nodes])
  const toolCount = useMemo(() => session.nodes.reduce((count, node) => node.kind === 'tool-result' ? count + 1 : count, 0), [session.nodes])
  if (loadError !== undefined) return <div className={css.empty}>{t('loadFailed', { reason: loadError })}</div>
  if (installation !== undefined && !installation.enabled) return <div className={css.empty}>{t('disabled')}</div>
  if (cursor === null) {
    const install = () => {
      if (busy) return
      setBusy(true)
      setRunError(undefined)
      void installTreadmill(sessionId)
        .catch((reason: unknown) => { setRunError(describe(reason)) })
        .finally(() => { setBusy(false) })
    }
    return (
      <div className={css.empty}>
        <p className={css.absent}>{t('absent')}</p>
        <button type="button" className={css.primary} disabled={busy || session.running} onClick={install}>
          {busy || session.running ? t('installing') : t('install')}
        </button>
        {runError !== undefined && <p className={css.error} role="alert">{t('installFailed', { reason: runError })}</p>}
      </div>
    )
  }
  if (cursor === undefined || installation === undefined) return <div className={css.empty}>…</div>
  const current = stages.find(stage => stage.current)
  const runnable = runnableStage(stages)
  const selected = stages.find(stage => stage.id === selectedId)
  const done = stages.filter(stage => stage.status === 'done' || stage.status === 'skipped').length
  const status = pipelineStatus(stages)
  const execute = (stage: StageSpec) => {
    if (busy) return
    setBusy(true)
    setRunError(undefined)
    void runStage(sessionId, stage, cursor)
      .catch((reason: unknown) => { setRunError(describe(reason)) })
      .finally(() => { setBusy(false) })
  }
  const toggleStage = (stage: StageView, patch: { enabled?: boolean; gate?: 'manual' | 'auto' }) => {
    setRunError(undefined)
    void updateStage(stage.id, patch)
      .then(() => { setInstallationGeneration(value => value + 1) })
      .catch((reason: unknown) => { setRunError(describe(reason)) })
  }
  const percent = stages.length === 0 ? 0 : Math.round((done / stages.length) * 100)
  const backlogDone = cursor.backlog.filter(item => item.status === 'done').length
  return (
    <div className={css.root}>
      <div className={css.control} data-panel={selected !== undefined}>
        <section className={css.graph} aria-label={t('title')}>
          <header className={css.head}>
            <div>
              <h2 className={css.title}>{cursor.plan ?? cursor.runId ?? t('title')}</h2>
              <span className={css.pipelineStatus} data-status={status}>{t(`pipeline.${status}`)}</span>
              <p className={css.meta}>
                {t('sprint')} {cursor.activeSprint ?? '—'} · {t('runId')} {cursor.runId ?? '—'} · {t('revision')} {cursor.revision ?? '—'}
              </p>
              <p className={css.meta}>{t(`table.${installation.tableSource}`)}</p>
            </div>
            <div className={css.actions}>
              <button
                type="button"
                className={css.ghost}
                data-active={following}
                title={t('followHint')}
                onClick={() => { followThrough.set(!following); setFollowing(!following) }}
              >
                {following ? t('followOn') : t('followOff')}
              </button>
              <button
                type="button"
                className={css.primary}
                disabled={busy || session.running || runnable === undefined}
                onClick={() => { if (runnable !== undefined) execute(runnable) }}
              >
                {busy || session.running ? t('running') : runnable !== undefined && runnable !== current ? t('skipTo', { stage: stageLabel(runnable, t) }) : t('run')}
              </button>
            </div>
          </header>
          {runError !== undefined && <p className={css.error} role="alert">{t('runFailed', { reason: runError })}</p>}
          {installation.pipelineError !== undefined && <p className={css.error} role="alert">{t('pipelineError', { reason: installation.pipelineError })}</p>}
          {current === undefined && cursor.stage !== undefined && cursor.stage !== 'done' && (
            <p className={css.error} role="alert">{t('unknownStage', { stage: cursor.stage })}</p>
          )}
          <div className={css.progress} aria-label={t('progress')}>
            <div className={css.track}><div className={css.bar} style={{ width: `${percent}%` }} /></div>
            <span className={css.progressLabel}>{done}/{stages.length}</span>
          </div>
          <ol className={css.nodes}>
            {stages.map(stage => (
              <li className={css.node} data-current={stage.current} data-status={stage.status} key={stage.id}>
                <div className={css.rail}>
                  <span className={css.dot} data-selected={stage.id === selectedId} aria-hidden="true">{stage.index + 1}</span>
                  {stage.index < stages.length - 1 && <span className={css.connector} aria-hidden="true" />}
                </div>
                <div className={css.body}>
                  <button
                    type="button"
                    className={css.name}
                    aria-pressed={stage.id === selectedId}
                    onClick={() => { setSelectedId(stage.id === selectedId ? null : stage.id) }}
                  >
                    <span className={css.section}>{sectionLabel(stage, t)}</span>
                    <span className={css.label}>{stageLabel(stage, t)}</span>
                  </button>
                  <span className={css.badge}>{t(`status.${stage.status}`)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
        {selected !== undefined && (
          <StagePanel
            stage={selected}
            cursor={cursor}
            busy={busy || session.running}
            t={t}
            onRun={() => { execute(selected) }}
            onToggle={(patch) => { toggleStage(selected, patch) }}
            onClose={() => { setSelectedId(null) }}
          />
        )}
      </div>
      <section className={css.band} aria-label={t('sprints')}>
        <header className={css.bandHead}>
          <h3 className={css.bandTitle}>{t('sprints')}</h3>
          {cursor.backlog.length > 0 && (
            <span className={css.bandCount}>
              {t('sprintsCount', { count: cursor.backlog.length })} · {backlogDone} {t('backlogDone')} · {cursor.backlog.length - backlogDone} {t('backlogPending')}
            </span>
          )}
        </header>
        {cursor.backlog.length === 0 ? <p className={css.bandEmpty}>{t('noSprints')}</p> : (
          <div className={css.grid}>
            {cursor.backlog.map(item => (
              <article className={css.card} data-active={item.id === cursor.activeSprint} key={item.id}>
                <span className={css.cardName}>{item.id}</span>
                <span className={css.cardPath}>{item.home}</span>
                <span className={css.badges}><span className={css.chip} data-status={item.status}>{item.status}</span></span>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className={css.band} aria-label={t('usage')}>
        <header className={css.bandHead}><h3 className={css.bandTitle}>{t('usage')}</h3></header>
        <div className={css.metrics}>
          <span>{t('input')} <b>{numeric(usage?.uncachedInputTokens).toLocaleString()}</b></span>
          <span>{t('output')} <b>{numeric(usage?.outputTokens).toLocaleString()}</b></span>
          <span>{t('cacheRead')} <b>{numeric(usage?.cacheReadTokens).toLocaleString()}</b></span>
          <span>{t('cacheWrite')} <b>{numeric(usage?.cacheWriteTokens).toLocaleString()}</b></span>
          <span>{t('tools')} <b>{toolCount}</b></span>
        </div>
      </section>
      <section className={css.band} aria-label={t('models')}>
        <header className={css.bandHead}><h3 className={css.bandTitle}>{t('models')}</h3></header>
        {assistants.length === 0 ? <p className={css.bandEmpty}>{t('noModelActivity')}</p> : (
          <ul className={css.modelList}>
            {assistants.map((node) => {
              const outputTokens = numeric((node.usage as Record<string, unknown> | undefined)?.outputTokens)
              return (
                <li key={node.seq}>
                  <b>{node.requestConfig?.provider ?? '—'} / {node.requestConfig?.model ?? '—'}</b>
                  <span>turn {node.turn} · step {node.step} · {outputTokens} output tokens</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      <p className={css.note}>{t('sourceNote')}</p>
    </div>
  )
}

interface StagePanelProps {
  stage: StageView
  cursor: TreadmillCursor
  busy: boolean
  t: Props['t']
  onRun: () => void
  onToggle: (patch: { enabled?: boolean; gate?: 'manual' | 'auto' }) => void
  onClose: () => void
}

function StagePanel({ stage, cursor, busy, t, onRun, onToggle, onClose }: StagePanelProps) {
  return (
    <aside className={css.panel} aria-label={t('panel')}>
      <header className={css.panelHead}>
        <div>
          <span className={css.section}>{sectionLabel(stage, t)}</span>
          <h3 className={css.panelTitle}>{stageLabel(stage, t)}</h3>
        </div>
        <button type="button" className={css.close} onClick={onClose} aria-label={t('close')}>✕</button>
      </header>
      <dl className={css.rows}>
        <div className={css.row}><dt>{t('status')}</dt><dd data-status={stage.status}>{t(`status.${stage.status}`)}</dd></div>
        <div className={css.row}><dt>{t('skill')}</dt><dd><code>{stageCommand(stage, cursor)}</code></dd></div>
        <div className={css.row}><dt>{t('gate')}</dt><dd>{stage.gate === 'gated' ? t('gateManual') : t('gateAuto')}</dd></div>
        <div className={css.row}>
          <dt>{t('attempt')}</dt>
          <dd>{stage.current && cursor.attempt !== undefined ? cursor.attempt : t('notRun')}</dd>
        </div>
        {stage.emitsVerdict && (
          <div className={css.row}>
            <dt>{t('verdict')}</dt>
            <dd>{stage.current && typeof cursor.verdict === 'string' ? cursor.verdict : t('noVerdict')}</dd>
          </div>
        )}
        <div className={css.row}>
          <dt>{t('produces')}</dt>
          <dd>{stage.produces.length === 0 ? t('nothingProduced') : stage.produces.map(path => <code key={path}>{path}</code>)}</dd>
        </div>
      </dl>
      <label className={css.toggle}>
        <input type="checkbox" checked={stage.enabled !== false} onChange={(event) => { onToggle({ enabled: event.target.checked }) }} />
        {stage.enabled === false ? t('stageDisabled') : t('stageEnabled')}
      </label>
      <label className={css.toggle}>
        <input type="checkbox" checked={stage.gate === 'auto'} onChange={(event) => { onToggle({ gate: event.target.checked ? 'auto' : 'manual' }) }} />
        {stage.gate === 'auto' ? t('gateAutoHint') : t('gateManualHint')}
      </label>
      <button type="button" className={css.ghost} disabled={busy || stage.enabled === false} onClick={onRun}>
        {busy ? t('running') : t('runStage')}
      </button>
    </aside>
  )
}
