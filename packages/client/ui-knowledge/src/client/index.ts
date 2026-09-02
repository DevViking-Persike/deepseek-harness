/**
 * Browser plugin contributing the Knowledge settings section: the skills,
 * decision records, and documentation one session can draw on.
 *
 * It defines no service and owns no RPC domain. Skills come from the existing
 * `skill.*` catalog and Markdown from the editor's workspace-fenced file
 * calls, so this section adds no second route to the disk.
 */
import type { ConnectionHandle, IApiClient, RpcError } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'settings.section' SlotMap row is declared by the shell.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { en, NS, zh } from './locales.ts'
import { KnowledgeSection } from './KnowledgeSection.tsx'
import type { KnowledgeInjected } from './KnowledgeSection.tsx'

export type {
  KnowledgeDoc, KnowledgeInjected, KnowledgeSectionProps, KnowledgeSkill,
} from './KnowledgeSection.tsx'

/** Required services: the settings slot registry, the wire client, the locale service, and the session list. */
export const inject = ['slots', 'connection', 'locale', 'sessions']

/** Marker for a composition serving neither skills nor a filesystem. */
export class KnowledgeUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KnowledgeUnavailable'
  }
}

/**
 * Narrow a domain refusal so the section can separate an absent seam from an
 * ordinary failure.
 * @param error - the RPC error the host answered with.
 * @returns the error the injected call rejects with.
 */
function knowledgeFailure(error: RpcError): Error {
  if (error.code === 'editor-unavailable') return new KnowledgeUnavailable(error.message)
  return new Error(`${error.code}: ${error.message}`)
}

/**
 * Client plugin body: register the Knowledge settings section.
 * @param ctx - client root context.
 */
/** Provider name of the harness-owned Treadmill installation, listed in its own pane. */
const TREADMILL_PROVIDER = 'treadmill'

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-knowledge: dictionaries')
  const t = ctx.locale.bind(NS)
  const { api } = ctx.get('connection') as ConnectionHandle

  /**
   * The wire client's editor rows, which this section reads Markdown through.
   * @returns the editor rows of the loaded wire client.
   * @throws KnowledgeUnavailable when this client build carries no editor domain.
   */
  const editor = (): IApiClient['editor'] => {
    const rows = (api as Partial<IApiClient>).editor
    if (rows === undefined) {
      throw new KnowledgeUnavailable('this page is running an older client build with no file support; reload to pick up the current build')
    }
    return rows
  }

  // The settings shell renders one section at root scope, while both wire
  // domains are addressed by session. The list publishes which session is
  // current, and that is the project the operator has open behind the panel.
  const currentSession = (): string | undefined => ctx.sessions.list.getSnapshot().current

  const injected: KnowledgeInjected = {
    listSkills: async (signal) => {
      const sessionId = currentSession()
      if (sessionId === undefined) return []
      const response = await api.skills.list({ sessionId: sessionId as never }, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
      // The Skills pane lists what the project, the user, and the composition
      // bring; the Treadmill installation has its own pane.
      return response.result.value.skills.filter(skill => skill.provider !== TREADMILL_PROVIDER).map(skill => ({
        name: skill.name,
        description: skill.description,
        ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
        modelInvocable: skill.modelInvocable,
        source: skill.source,
        ...skill.path === undefined ? {} : { path: skill.path },
      }))
    },
    listDir: async (path, signal) => {
      const sessionId = currentSession()
      const response = await editor().listDir({
        ...sessionId === undefined ? {} : { sessionId },
        ...path === undefined ? {} : { path },
      }, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
      return response.result.value
    },
    readFile: async (path, signal) => {
      const sessionId = currentSession()
      const response = await editor().readFile({
        ...sessionId === undefined ? {} : { sessionId },
        path,
      }, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
      return { content: response.result.value.content }
    },
    editFile: async (path, signal) => {
      const response = await api.host.openPath({ path }, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
    },
    describeTreadmill: async (signal) => {
      const response = await api.treadmill.describe({}, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
      const { root, enabled, files, pipelineError } = response.result.value
      return { root, enabled, files, ...pipelineError === undefined ? {} : { pipelineError } }
    },
    readTreadmillFile: async (path, signal) => {
      const response = await api.treadmill.readFile({ path }, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
      return response.result.value.content
    },
    writeTreadmillFile: async (path, content, signal) => {
      const response = await api.treadmill.writeFile({ path, content }, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
    },
    setTreadmillEnabled: async (enabled, signal) => {
      const response = await api.settings.update({ ns: 'treadmill', patch: { enabled } }, signal)
      if (!response.result.ok) throw knowledgeFailure(response.result.error)
    },
  }

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'knowledge',
    // After Plugins (15) and before Agent presets (20) would split a pair that
    // reads together, so this sits after both.
    order: 25,
    locale: NS,
    label: () => t('section.label'),
    inject: () => injected,
  }, KnowledgeSection))
}
