/** Browser Esteira plugin: project cursor projection and logged Session execution. */
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { EsteiraView } from './EsteiraView.tsx'
import { en, NS, zh, type EsteiraKey } from './locales.ts'
import { parseCursor, stagePrompt, type EsteiraCursor, type StageSpec } from './stages.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { esteira: EsteiraKey }
}
export const inject = ['connection', 'sessions', 'slots', 'locale']

/** Register the Esteira view after Docker. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-esteira: dictionaries')
  const api = (ctx.get('connection') as ConnectionHandle).api
  const sessions = ctx.get('sessions') as ISessions
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'esteira', order: 30, locale: NS,
    label: () => ctx.locale.bind(NS)('view.esteira'),
    inject: (sessionId: SessionId) => ({
      loadCursor: async (signal: AbortSignal) => {
        const response = await api.editor.readFile({ sessionId, path: '.spec/esteira-state.yaml' }, signal)
        if (!response.result.ok) {
          if (response.result.error.code === 'editor-not-found') return null
          throw new Error(`${response.result.error.code}: ${response.result.error.message}`)
        }
        return parseCursor(response.result.value.content)
      },
      runStage: async (id: SessionId, stage: StageSpec, cursor: EsteiraCursor) => {
        const session = sessions.binding(id)?.session
        if (session === undefined) throw new Error('the current Session is unavailable')
        const result = await session.prompt([{ type: 'text', text: stagePrompt(stage, cursor) }], 'queue')
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      },
    }),
  }, EsteiraView))
}
