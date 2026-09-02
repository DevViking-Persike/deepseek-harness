/** Browser Treadmill plugin: project cursor projection and logged Session execution. */
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TreadmillView } from './TreadmillView.tsx'
import { en, NS, zh, type TreadmillKey } from './locales.ts'
import { INSTALL_PROMPT, parseCursor, stagePrompt, stagesFromHost, type TreadmillCursor, type StageSpec } from './stages.ts'

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
      loadCursor: async (signal: AbortSignal) => {
        const response = await api.editor.readFile({ sessionId, path: '.spec/esteira-state.yaml' }, signal)
        if (!response.result.ok) {
          if (response.result.error.code === 'editor-not-found') return null
          throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
        }
        return parseCursor(response.result.value.content)
      },
      runStage: async (id: SessionId, stage: StageSpec, cursor: TreadmillCursor) => {
        const table = await loadTable(id)
        await submit(id, stagePrompt(stage, cursor, table))
      },
      setStageEnabled: async (stageId: string, enabled: boolean) => {
        const response = await api.treadmill.setStageEnabled({ sessionId, id: stageId, enabled })
        if (!response.result.ok) throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
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
