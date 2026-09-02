/** Chat composer control that submits an explicit Archify skill request. */

import { useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation composer tool-row SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './ArchifySeat.module.css'

/** Registration-owned operation exposed to the control. */
export interface ArchifySeatInjected {
  /** Submit the durable architecture-generation request to one session. */
  generate: (sessionId: SessionId) => Promise<void>
}

/** Full slot component props. */
type ArchifySeatProps =
  PropsRuntime<'conversation.input.left'>
  & PropsLocale<'skill'>
  & InjectFace<ArchifySeatInjected>

/**
 * Render the one-click architecture generation action.
 * @param props - current session snapshot plus the injected submit operation.
 * @returns the compact composer control.
 */
export function ArchifySeat({ session, generate, t }: ArchifySeatProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const run = (): void => {
    if (busy || session.running) return
    setBusy(true)
    setError(undefined)
    void generate(session.sessionId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => { setBusy(false) })
  }
  return (
    <span className={css.root} title={error ?? t('archify.hint')}>
      <Button size="sm" variant="ghost" disabled={busy || session.running} onClick={run}>
        {busy ? t('archify.running') : t('archify.action')}
      </Button>
    </span>
  )
}
