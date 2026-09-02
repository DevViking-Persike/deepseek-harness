/** Esteira projection view over the current workspace Session and project files. */
import { useEffect, useMemo, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the tokenUsage key into SessionProjectionMap for useProjection.
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { EsteiraKey } from './locales.ts'
import css from './EsteiraView.module.css'

export type EsteiraRoute = 'overview' | 'stages' | 'runs' | 'usage' | 'models' | 'artifacts' | 'config'
export interface EsteiraCursor {
  schema?: number | undefined
  plan?: string | undefined
  activeSprint?: string | undefined
  stage?: string | undefined
  attempt?: number | undefined
  verdict?: string | null | undefined
  runId?: string | undefined
  revision?: number | undefined
  backlog: readonly { id: string; home: string; status: string }[]
}
export interface EsteiraViewInjected {
  loadCursor: (signal: AbortSignal) => Promise<EsteiraCursor | null>
  runStage: (sessionId: SessionId, cursor: EsteiraCursor) => Promise<void>
}
type Props = ConvViewProps & PropsLocale<'esteira'> & InjectFace<EsteiraViewInjected>

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
function describe(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function EsteiraView({ sessionId, useSession, useProjection, loadCursor, runStage, t }: Props) {
  const session = useSession(snapshot => snapshot)
  const usage = useProjection('tokenUsage')
  const [route, setRoute] = useState<EsteiraRoute>('overview')
  const [cursor, setCursor] = useState<EsteiraCursor | null | undefined>(undefined)
  const [error, setError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    void loadCursor(abort.signal).then(setCursor).catch((reason: unknown) => { setError(describe(reason)) })
    return () => { abort.abort() }
  }, [loadCursor])
  const assistants = useMemo(() => session.nodes.filter(node => node.kind === 'assistant'), [session.nodes])
  const toolCount = useMemo(() => session.nodes.reduce((count, node) => node.kind === 'tool-result' ? count + 1 : count, 0), [session.nodes])
  const routes: readonly [EsteiraRoute, EsteiraKey][] = [
    ['overview', 'overview'], ['stages', 'stages'], ['runs', 'runs'], ['usage', 'usage'], ['models', 'models'], ['artifacts', 'artifacts'], ['config', 'config'],
  ]
  if (error !== undefined) return <div className={css.empty}>{t('loadFailed', { reason: error })}</div>
  if (cursor === null) return <div className={css.empty}>{t('absent')}</div>
  if (cursor === undefined) return <div className={css.empty}>…</div>
  const execute = () => {
    if (busy) return
    setBusy(true)
    void runStage(sessionId, cursor)
      .catch((reason: unknown) => { setError(describe(reason)) })
      .finally(() => { setBusy(false) })
  }
  return (
    <div className={css.root}>
      <header className={css.header}>
        <div><h2>{t('title')}</h2><p>{t('sourceNote')}</p></div>
        <button type="button" className={css.primary} disabled={busy || session.running} onClick={execute}>{busy ? t('running') : t('run')}</button>
      </header>
      <nav className={css.nav} aria-label={t('title')}>
        {routes.map(([id, key]) => <button type="button" aria-current={route === id ? 'page' : undefined} onClick={() => { setRoute(id) }} key={id}>{t(key)}</button>)}
      </nav>
      {route === 'overview' && <section className={css.grid}>
        <article><span>{t('sprint')}</span><strong>{cursor.activeSprint ?? '—'}</strong></article>
        <article><span>{t('stage')}</span><strong>{cursor.stage ?? '—'}</strong></article>
        <article><span>{t('attempt')}</span><strong>{cursor.attempt ?? '—'}</strong></article>
        <article><span>{t('verdict')}</span><strong>{cursor.verdict ?? '—'}</strong></article>
      </section>}
      {route === 'stages' && <section className={css.panel}><h3>{t('stages')}</h3><ol className={css.stageList}>{['00-discovery','plano','00s','10a','20','25','10b','30-qa-rpa','30-qa','40-redteam','40-seguranca','deploy'].map(id => <li data-active={id === cursor.stage} key={id}>{id}</li>)}</ol></section>}
      {route === 'runs' && <section className={css.panel}><h3>{t('runs')}</h3><p>{cursor.runId ?? '—'} · revision {cursor.revision ?? '—'}</p><p>{cursor.backlog.filter(item => item.status === 'done').length} {t('done')} · {cursor.backlog.filter(item => item.status !== 'done').length} {t('pending')}</p></section>}
      {route === 'usage' && <section className={css.panel}><h3>{t('tokens')}</h3><div className={css.metrics}><span>{t('input')} <b>{numeric(usage?.uncachedInputTokens).toLocaleString()}</b></span><span>{t('output')} <b>{numeric(usage?.outputTokens).toLocaleString()}</b></span><span>{t('cacheRead')} <b>{numeric(usage?.cacheReadTokens).toLocaleString()}</b></span><span>{t('cacheWrite')} <b>{numeric(usage?.cacheWriteTokens).toLocaleString()}</b></span></div><p>{t('costUnavailable')}</p></section>}
      {route === 'models' && <section className={css.panel}><h3>{t('modelActivity')}</h3>{assistants.length === 0 ? <p>{t('noModelActivity')}</p> : <ul className={css.modelList}>{assistants.map(node => <li key={node.seq}><b>{node.requestConfig?.provider ?? '—'} / {node.requestConfig?.model ?? '—'}</b><span>turn {node.turn} · step {node.step} · {numeric((node.usage as Record<string, unknown> | undefined)?.outputTokens)} output tokens</span></li>)}</ul>}<p>{t('tools')}: {toolCount}</p></section>}
      {route === 'artifacts' && <section className={css.panel}><h3>{t('artifacts')}</h3><ul>{cursor.backlog.map(item => <li key={item.id}><code>{item.home}</code> — {item.status}</li>)}</ul></section>}
      {route === 'config' && <section className={css.panel}><h3>{t('config')}</h3><dl><dt>{t('skillRoot')}</dt><dd><code>.opennjord/skills</code></dd><dt>{t('cursor')}</dt><dd><code>.spec/esteira-state.yaml</code></dd><dt>Plano</dt><dd><code>{cursor.plan ?? '—'}</code></dd></dl></section>}
    </div>
  )
}
