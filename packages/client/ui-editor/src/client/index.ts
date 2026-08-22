/**
 * Browser code editor plugin contributing one entry to the conversation view
 * slot without defining a service. The `editor.*` RPC domain is stateless and
 * read by this plugin alone, so the wire calls stay in this apply closure
 * rather than becoming a client-runtime object-layer service.
 */
import type { ConnectionHandle, IApiClient, RpcError } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view' SlotMap row (declared by the slot's
// owning package) must be in the program for the register call to type.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { en, NS, zh } from './locales.ts'
import { EditorDenied, EditorStale, EditorUnavailable, EditorView } from './EditorView.tsx'
import type { EditorFileBuffer, EditorListing, EditorViewInjected } from './EditorView.tsx'

export type {
  EditorFileBuffer, EditorListing, EditorViewInjected, EditorViewProps,
} from './EditorView.tsx'

/** Required services: the conversation slot registry, the wire client, and the locale service. */
export const inject = ['slots', 'connection', 'locale']

/**
 * Narrow an editor-domain refusal so the view can separate a save that must be
 * reloaded from one the sandbox refused, and both from an ordinary failure.
 * @param error - the RPC error the host answered with.
 * @returns the error the injected call rejects with.
 */
function editorFailure(error: RpcError): Error {
  if (error.code === 'editor-stale') return new EditorStale(error.message)
  if (error.code === 'editor-denied') return new EditorDenied(error.message)
  if (error.code === 'editor-unavailable') return new EditorUnavailable(error.message)
  return new Error(`${error.code}: ${error.message}`)
}

/**
 * Client plugin body: register the editor view tab. The registration rides the
 * slot service's effect wrapper, so plugin unload removes the tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-editor: dictionaries')
  // Registration-time text (the view tab label) reads through the bound
  // translate as a thunk, so it follows the active locale without
  // re-registration.
  const t = ctx.locale.bind(NS)
  const { api } = ctx.get('connection') as ConnectionHandle

  /**
   * The wire client's editor rows. A client artifact predating the editor
   * domain has no such member, and reading through it would fail with a
   * property TypeError the view cannot present.
   * @returns the editor rows of the loaded wire client.
   * @throws EditorUnavailable when this client build carries no editor domain.
   */
  const editor = (): IApiClient['editor'] => {
    const rows = (api as Partial<IApiClient>).editor
    if (rows === undefined) {
      throw new EditorUnavailable('this page is running an older client build with no editor support; reload to pick up the current build')
    }
    return rows
  }

  // Built once so the identities stay stable across inject reads: the view
  // keys its load effects on them, and a fresh closure per read would restart
  // every request on each render.
  const makeInjected = (sessionId: SessionId): EditorViewInjected => ({
    languageServers: async (signal) => {
      const response = await editor().languageServers({}, signal)
      if (!response.result.ok) throw editorFailure(response.result.error)
      return response.result.value.servers
    },
    listDir: async (path, signal): Promise<EditorListing> => {
      const response = await editor().listDir({
        sessionId,
        ...path === undefined ? {} : { path },
      }, signal)
      if (!response.result.ok) throw editorFailure(response.result.error)
      return response.result.value
    },
    readFile: async (path, signal): Promise<EditorFileBuffer> => {
      const response = await editor().readFile({ sessionId, path }, signal)
      if (!response.result.ok) throw editorFailure(response.result.error)
      return response.result.value
    },
    writeFile: async (path, content, version): Promise<string> => {
      const response = await editor().writeFile({ sessionId, path, content, version })
      if (!response.result.ok) throw editorFailure(response.result.error)
      return response.result.value.version
    },
  })

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'editor',
    // After Docker (20), which itself sits after Chat and Trajectory.
    order: 30,
    locale: NS,
    label: () => t('view.editor'),
    inject: makeInjected,
  }, EditorView))
}
