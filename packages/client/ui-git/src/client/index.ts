/**
 * Browser version-control plugin contributing one panel to the editor tab's
 * panel ring. The `git.*` RPC domain is stateless and read by this plugin
 * alone, so the wire calls stay in this apply closure rather than becoming a
 * client-runtime object-layer service.
 *
 * The panel sits INSIDE the editor tab rather than beside it as its own view:
 * reviewing a change and editing it share one file tree, one buffer, and one
 * session, and splitting them across two tabs would duplicate all three.
 */
import type { ConnectionHandle, IApiClient, RpcError } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'conversation.view.editor.panel' SlotMap row, declared by the
// editor tab that owns it, must be in the program for the register call to type.
import type {} from '@deepseek-ai/dsh-client-ui-editor/client'
import { en, NS, zh } from './locales.ts'
import { GitPanel, GitUnavailable } from './GitPanel.tsx'
import type { GitPanelInjected, GitStatusView, GitWorktreeRow } from './GitPanel.tsx'

export type {
  GitChangeRow, GitPanelInjected, GitPanelProps, GitRepositoryRow, GitStatusView,
  GitWorktreeRow,
} from './GitPanel.tsx'

/**
 * Required services: the slot registry, the wire client, the session registry
 * (an agent-run commit is a prompt to the session's agent), and the locale
 * service.
 */
export const inject = ['slots', 'connection', 'sessions', 'locale']

/**
 * Narrow a git-domain refusal: an absent seam becomes the panel's calm empty
 * state, every other code an ordinary failure carrying the host's own text.
 * @param error - the RPC error the host answered with.
 * @returns the error the injected call rejects with.
 */
function gitFailure(error: RpcError): Error {
  return error.code === 'git-unavailable'
    ? new GitUnavailable(error.message)
    : new Error(error.message)
}

/**
 * Client plugin body: register the version-control panel. The registration
 * rides the slot service's inject wrapper, so it waits for the editor tab to
 * declare its panel ring and leaves when that declaration collapses.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-git: dictionaries')
  // Registration-time text (the panel label) reads through the bound translate
  // as a thunk, so it follows the active locale without re-registration.
  const t = ctx.locale.bind(NS)
  const { api } = ctx.get('connection') as ConnectionHandle

  /**
   * The wire client's git rows. A client artifact predating the git domain has
   * no such member, and reading through it would fail with a property
   * TypeError the panel cannot present; refusing the way an absent seam does
   * keeps that case on the calm unavailable state.
   * @returns the git rows of the loaded wire client.
   * @throws GitUnavailable when this client build carries no git domain.
   */
  const git = (): IApiClient['git'] => {
    const rows = (api as Partial<IApiClient>).git
    if (rows === undefined) {
      throw new GitUnavailable('this page is running an older client build with no Git support; reload to pick up the current build')
    }
    return rows
  }

  // Built once so the identities stay stable across inject reads: the panel
  // keys its load effects on them, and a fresh closure per read would restart
  // every request on each render.
  const listRepositories = async (signal: AbortSignal) => {
    const response = await git().listRepositories({}, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value.repositories
  }
  const worktrees = async (root: string, signal: AbortSignal): Promise<readonly GitWorktreeRow[]> => {
    const response = await git().worktrees({ root }, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value.worktrees
  }
  const compareBases = async (root: string, signal: AbortSignal) => {
    const response = await git().compareBases({ root }, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value.comparisons
  }
  const graph = async (root: string, signal: AbortSignal) => {
    const response = await git().graph({ root }, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return {
      commits: response.result.value.commits,
      truncated: response.result.value.truncated,
    }
  }
  const status = async (root: string, signal: AbortSignal): Promise<GitStatusView> => {
    const response = await git().status({ root }, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value
  }
  const diff = async (root: string, path: string, staged: boolean, signal: AbortSignal) => {
    const response = await git().diff({ root, path, side: staged ? 'index' : 'worktree' }, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value
  }
  const stage = async (root: string, paths: readonly string[]): Promise<GitStatusView> => {
    const response = await git().stage({ root, paths: [...paths] })
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value
  }
  const unstage = async (root: string, paths: readonly string[]): Promise<GitStatusView> => {
    const response = await git().unstage({ root, paths: [...paths] })
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value
  }
  const discard = async (root: string, path: string, staged: boolean) => {
    const response = await git().discard({ root, path, side: staged ? 'index' : 'worktree' })
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value
  }
  const commit = async (root: string, message: string) => {
    const response = await git().commit({ root, message })
    if (!response.result.ok) throw gitFailure(response.result.error)
    return { subject: response.result.value.commit.subject, status: response.result.value.status }
  }

  /**
   * Ask the session's agent to make the same commit. The direct button above
   * writes without a session event; routing through the agent instead records
   * the commit as a logged tool call, which is what a user wanting an audit
   * trail picks. Both routes exist because both are legitimate: one is the
   * operator's own gesture, the other is work the session should remember.
   * @param sessionId - the conversation whose agent runs the commit.
   * @param root - absolute path of the repository to commit in.
   * @param message - the commit message the person wrote.
   * @returns nothing; the turn's progress is visible in Chat.
   * @throws Error when the session is unavailable or refused the prompt.
   */
  const requestCommit = async (sessionId: SessionId, root: string, message: string): Promise<void> => {
    const session = ctx.sessions.binding(sessionId)?.session
    if (session === undefined) throw new Error(`ui-git: session "${sessionId}" is unavailable`)
    const text = `Run the git_commit tool with repository set to the absolute path ${root} and message set to exactly: ${message}`
    // `queue` rather than `steer`: the action is a new request, not a
    // correction of whatever turn is already running.
    const result = await session.prompt([{ type: 'text', text }], 'queue')
    if (!result.ok) throw new Error(result.error.message)
  }

  const injected = (sessionId: SessionId): GitPanelInjected => ({
    listRepositories,
    worktrees,
    compareBases,
    graph,
    status,
    diff,
    stage,
    unstage,
    discard,
    commit,
    requestCommit: (root, message) => requestCommit(sessionId, root, message),
  })

  ctx.slots.inject('conversation.view.editor.panel', () => ctx.slots.register({
    name: 'conversation.view.editor.panel',
    id: 'git',
    order: 10,
    locale: NS,
    label: () => t('panel.git'),
    inject: injected,
  }, GitPanel))
}
