/**
 * The session header's agent-preset selector.
 *
 * A started session's composition is fixed — its history was produced under
 * that preset's tools — so the host refuses an in-place swap. The honest
 * affordance is a continuation: picking another preset forks the session at
 * its last completed turn, composes the child under the pick, and opens it
 * with the visible history preserved. The original session is never mutated.
 *
 * The current row is marked and picking it is a no-op. While blank the chip
 * in the composer's tool row ({@link AgentPresetSeat}) owns the choice and
 * this selector stays out of the header, so one session never shows two
 * controls for the same fact.
 */

import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconAgentPresetOutline16, IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
// Type-only: pulls the ui-conversation SlotMap merge (the header actions).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AgentPresetSettingsState } from './settings-store.ts'
import { presetDisplayText } from './locales.ts'
import css from './AgentPresetLabel.module.css'

/** Registration-side business face for the header selector. */
export interface AgentPresetLabelInjected {
  hooks: {
    /** Roster snapshot bound by the renderer as useAgentPresets. */
    agentPresets: SnapshotStore<AgentPresetSettingsState>
  }
  /** Read the roster, so the selector can show names rather than ids. */
  load: () => Promise<void>
  /**
   * Recompose this session's agent under another preset, in place: the same
   * session keeps its history and identity; the next request assembles the
   * new composition's prompt and tool schemas. Resolves with the host's
   * confirmed preset id; rejects while a turn is running.
   * @param sessionId - the session the header describes.
   * @param agentPreset - the picked preset id.
   */
  switchTo: (sessionId: string, agentPreset: string) => Promise<string>
}

/** Full component props. */
export type AgentPresetLabelProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'settings.agentPreset'>
  & InjectFace<AgentPresetLabelInjected>

/**
 * Render this session's agent-preset selector beside its title.
 * @param props - composed slot props.
 * @returns the selector, or null when the session records no preset.
 */
export function AgentPresetLabel({
  sessionId, useSessions, useAgentPresets, load, switchTo, t,
}: AgentPresetLabelProps) {
  const preset = useSessions(state => state.byId[sessionId]?.agentPreset)
  const blank = useSessions(state => state.byId[sessionId]?.blank)
  const options = useAgentPresets(state => state.options)
  // A blank session's choice is still open and the composer chip is showing
  // it; a session with no summary row yet is not one this header describes.
  const reports = preset !== undefined && blank === false
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Deployments that compose no presets never label anything, so the roster
    // is only worth a request once a started session reports one.
    if (reports) void load()
  }, [reports, load])

  if (!reports) return null

  const option = options.find(entry => entry.id === preset)
  const text = option === undefined ? undefined : presetDisplayText(option, t)
  const label = text?.name ?? preset
  // presetOptions already drops broken presets: offering one that cannot
  // compose would only defer the failure to the continuation's first turn.
  const pickable = options
  const hint = error ?? t('headerMenuHint')

  const onSelect = (id: string): void => {
    // The composition the session already runs is not a switch.
    if (id === preset || busy) return
    setBusy(true)
    setError(null)
    void switchTo(sessionId, id)
      .then((confirmed: string) => { setError(null); void confirmed })
      .catch((failure: unknown) => { setError(failure instanceof Error ? failure.message : String(failure)) })
      .finally(() => { setBusy(false) })
  }

  return (
    <Menu
      open={open}
      onClose={() => { setOpen(false) }}
      items={pickable.map((entry) => {
        const entryText = presetDisplayText(entry, t)
        return {
          id: entry.id,
          // Name and description together: the id alone never says what a
          // preset does, which is why the roster carries display copy.
          label: (
            <span className={css.item}>
              <span className={css.itemName}>{entryText.name}</span>
              <span className={css.itemDesc}>{entryText.description ?? t('noDescription')}</span>
            </span>
          ),
        }
      })}
      selectedId={preset}
      onSelect={onSelect}
      align="start"
      portal
      anchor={(
        <button
          type="button"
          className={css.label}
          aria-haspopup="menu"
          aria-expanded={open}
          title={hint}
          disabled={busy || pickable.length === 0}
          onClick={() => { setOpen(value => !value) }}
        >
          <IconAgentPresetOutline16 size={14} className={css.icon} />
          {busy ? t('headerBusy') : label}
          <IconChevronDownOutline14 className={css.chevron} />
        </button>
      )}
    />
  )
}
