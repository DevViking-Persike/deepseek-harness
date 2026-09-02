/** Browser Esteira plugin: project cursor projection and logged Session execution. */
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { EsteiraView, type EsteiraCursor } from './EsteiraView.tsx'
import { en, NS, zh, type EsteiraKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { esteira: EsteiraKey }
}
export const inject = ['connection', 'sessions', 'slots', 'locale']

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
function parseCursor(text: string): EsteiraCursor {
  const backlogStart = text.search(/^backlog:\s*$/m)
  const tail = backlogStart < 0 ? '' : text.slice(backlogStart)
  const backlog = [...tail.matchAll(/^\s*- id:\s*(\S+)\s*\n\s*home:\s*(\S+)\s*\n\s*status:\s*(\S+)/gm)]
    .map(match => ({ id: match[1] ?? '', home: match[2] ?? '', status: match[3] ?? '' }))
  const verdict = scalar(text, 'veredito')
  return {
    schema: numberScalar(text, 'schema'), plan: scalar(text, 'plano'), activeSprint: scalar(text, 'sprint_ativa'),
    stage: scalar(text, 'etapa'), attempt: numberScalar(text, 'tentativa'), verdict: verdict === 'null' ? null : verdict,
    runId: scalar(text, 'run_id'), revision: numberScalar(text, 'revision'), backlog,
  }
}

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
      runStage: async (id: SessionId, cursor: EsteiraCursor) => {
        if (cursor.stage === undefined) throw new Error('the Esteira cursor has no current stage')
        const session = sessions.binding(id)?.session
        if (session === undefined) throw new Error('the current Session is unavailable')
        const skill = cursor.stage === '10a' || cursor.stage === '10b' ? 'arquitetura'
          : cursor.stage === '00s' || cursor.stage === '00-discovery' || cursor.stage === 'plano' ? 'discovery'
            : cursor.stage === '20' ? 'desenvolvimento'
              : cursor.stage === '25' ? 'review-codigo-subagents'
                : cursor.stage.replace(/^\d+-/, '')
        const mode = cursor.stage === '10a' ? ' design' : cursor.stage === '10b' ? ' review' : cursor.stage === '00s' && cursor.activeSprint !== undefined ? ` sprint ${cursor.activeSprint}` : ''
        const prompt = `/${skill}${mode} Execute somente a etapa ${cursor.stage} da Esteira OpenNjord para o cursor .spec/esteira-state.yaml. Use as Skills instaladas em .opennjord/skills e preserve todos os gates, artefatos, receipts e paradas humanas do método. Não avance outra etapa e não declare conclusão sem validar os artefatos canônicos.`
        const result = await session.prompt([{ type: 'text', text: prompt }], 'queue')
        if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      },
    }),
  }, EsteiraView))
}
