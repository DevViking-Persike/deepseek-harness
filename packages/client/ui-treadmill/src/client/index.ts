/** Browser Treadmill plugin: project cursor projection and logged Session execution. */
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TreadmillView } from './TreadmillView.tsx'
import { createFollower } from './follower.ts'
import { en, NS, zh, type TreadmillKey } from './locales.ts'
import {
  INSTALL_PROMPT, parseCursor, pipelineStatus, projectStages, runnableStage, stagePrompt, stagesFromHost,
  type TreadmillCursor, type StageSpec,
} from './stages.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { treadmill: TreadmillKey }
}
export const inject = ['connection', 'sessions', 'slots', 'locale']

/** Register the Treadmill view after Docker. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-treadmill: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const sessions = ctx.get('sessions') as ISessions
  const submit = async (id: SessionId, text: string) => {
    const session = sessions.binding(id)?.session
    if (session === undefined) throw new Error('the current Session is unavailable')
    const result = await session.prompt([{ type: 'text', text }], 'queue')
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  }
  const loadCursor = async (id: SessionId, signal?: AbortSignal): Promise<TreadmillCursor | null> => {
    const response = await api.editor.readFile({ sessionId: id, path: '.spec/esteira-state.yaml' }, signal)
    if (!response.result.ok) {
      if (response.result.error.code === 'editor-not-found') return null
      throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
    }
    return parseCursor(response.result.value.content)
  }

  /**
   * Follow-through: after a Treadmill-started run ends, the next stage runs
   * by itself while the cursor moved and the stage's gate is `auto`. A
   * `manual` gate, an unmoved cursor, an error verdict, or a switched-off
   * follower leaves the next step to the run action.
   */
  const follower = createFollower({
    session: (id: SessionId) => sessions.binding(id)?.session,
    next: async (id: SessionId) => {
      const [cursor, table] = await Promise.all([loadCursor(id), loadTable(id)])
      if (cursor === null) return undefined
      const stages = projectStages(cursor, false, table)
      if (pipelineStatus(stages) === 'failed') return undefined
      const stage = runnableStage(stages)
      if (stage === undefined || stage.gate === 'gated') return undefined
      return { cursorStage: cursor.stage, stage, prompt: stagePrompt(stage, cursor, table) }
    },
    submit,
    warn: (message: string) => { ctx.logger.warn(`ui-treadmill: ${message}`) },
  })
  ctx.effect(() => () => { follower.dispose() }, 'ui-treadmill: follow-through watchers')

  /** The effective stage table of one session's project, so a stage prompt can name the disabled stages. */
  const loadTable = async (id: SessionId): Promise<StageSpec[]> => {
    const response = await api.treadmill.describe({ sessionId: id })
    if (!response.result.ok) throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
    return stagesFromHost(response.result.value.stages)
  }
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'treadmill', order: 30, locale: NS,
    label: () => ctx.locale.bind(NS)('view.treadmill'),
    inject: (sessionId: SessionId) => ({
      loadCursor: (signal: AbortSignal) => loadCursor(sessionId, signal),
      runStage: async (id: SessionId, stage: StageSpec, cursor: TreadmillCursor) => {
        const table = await loadTable(id)
        await submit(id, stagePrompt(stage, cursor, table))
        follower.started(id, stage.id)
      },
      updateStage: async (stageId: string, patch: { enabled?: boolean; gate?: 'manual' | 'auto' }) => {
        const response = await api.treadmill.updateStage({ sessionId, id: stageId, ...patch })
        if (!response.result.ok) throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
      },
      followThrough: {
        get: () => follower.enabled(sessionId),
        set: (enabled: boolean) => { follower.setEnabled(sessionId, enabled) },
      },
      installTreadmill: (id: SessionId) => submit(id, INSTALL_PROMPT),
      loadInstallation: async (signal: AbortSignal) => {
        const response = await api.treadmill.describe({ sessionId }, signal)
        if (!response.result.ok) throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
        const { enabled, stages, pipelineError, tableSource } = response.result.value
        return { enabled, stages: stagesFromHost(stages), tableSource, ...pipelineError === undefined ? {} : { pipelineError } }
      },
    }),
  }, TreadmillView))
}
