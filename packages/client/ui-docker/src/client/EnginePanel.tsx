/**
 * The engine panel shown in place of a container list when no Docker engine
 * answers. It offers exactly the remedies the host reported as possible, so a
 * machine whose runtime is installed but stopped gets a start button, and one
 * with no runtime gets an install button only when the deployment permits it.
 */

import { useState } from 'react'
import type { DockerEngineStatusView } from '@deepseek-ai/dsh-api-remotes/client'
import type { DockerViewProps } from './DockerView.tsx'
import css from './EnginePanel.module.css'

/** Engine calls injected from the plugin's apply closure. */
export interface EnginePanelProps {
  /** The status the host last reported; absent while it is still being read. */
  status: DockerEngineStatusView | undefined
  /** Start the local runtime; resolves once the attempt settled. */
  startEngine: () => Promise<void>
  /** Install a container runtime; resolves once the attempt settled. */
  installEngine: () => Promise<void>
  /** Bound translate for the docker namespace. */
  t: DockerViewProps['t']
}

/** What the panel is doing right now. */
type Action =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'installing' }
  | { kind: 'failed'; reason: string }

/**
 * Render the engine panel.
 * @param props - the reported status, the two engine actions, and `t`.
 * @returns the explanation and whichever remedies apply.
 */
export function EnginePanel({ status, startEngine, installEngine, t }: EnginePanelProps) {
  const [action, setAction] = useState<Action>({ kind: 'idle' })
  const busy = action.kind === 'starting' || action.kind === 'installing'

  const run = (kind: 'starting' | 'installing', call: () => Promise<void>) => {
    setAction({ kind })
    call().then(
      () => { setAction({ kind: 'idle' }) },
      (error: unknown) => {
        setAction({ kind: 'failed', reason: error instanceof Error ? error.message : String(error) })
      },
    )
  }

  return (
    <div className={css.panel} role="status">
      <p className={css.title}>{t('unavailable')}</p>
      {status?.detail !== undefined && <p className={css.detail}>{status.detail}</p>}
      {action.kind === 'starting' && <p className={css.detail}>{t('engine.starting')}</p>}
      {action.kind === 'installing' && <p className={css.detail}>{t('engine.installing')}</p>}
      {action.kind === 'failed' && (
        <p className={css.detail}>{t('engine.failed', { reason: action.reason })}</p>
      )}
      <div className={css.actions}>
        {status?.startable === true && (
          <button
            type="button"
            className={css.action}
            disabled={busy}
            onClick={() => { run('starting', startEngine) }}
          >
            {t('engine.start', { runtime: status.runtime ?? '' })}
          </button>
        )}
        {status?.installable === true && (
          <button
            type="button"
            className={css.action}
            disabled={busy}
            onClick={() => { run('installing', installEngine) }}
          >
            {t('engine.install', { runtime: status.runtime ?? '' })}
          </button>
        )}
      </div>
    </div>
  )
}
