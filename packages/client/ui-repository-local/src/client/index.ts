/**
 * Browser local repository plugin contributing the 'local' section to the
 * repositories view. Queries the host's existing `git.*` RPC domain.
 */
import type { ConnectionHandle, IApiClient, RpcError } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-repositories/client'
import { en, NS, zh } from './locales.ts'
import { GitUnavailable, RepositoryLocalSection } from './RepositoryLocalSection.tsx'
import type { GitRepositoryRow, GitStatusView, RepositoryLocalInjected } from './RepositoryLocalSection.tsx'

export type {
  GitChangeRow,
  GitRepositoryRow,
  GitStatusView,
  RepositoryLocalInjected,
  RepositoryLocalProps,
} from './RepositoryLocalSection.tsx'

/** Required services: the slot registry, the wire connection, and locale service. */
export const inject = ['slots', 'connection', 'locale']

function gitFailure(error: RpcError): Error {
  return error.code === 'git-unavailable'
    ? new GitUnavailable(error.message)
    : new Error(error.message)
}

/**
 * Client plugin body: register the local repository section into the repositories view.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-repository-local: dictionaries')
  const t = ctx.locale.bind(NS)
  const { api } = ctx.get('connection') as ConnectionHandle

  const git = (): IApiClient['git'] => {
    const rows = (api as Partial<IApiClient>).git
    if (rows === undefined) {
      throw new GitUnavailable('this page is running an older client build with no Git support; reload to pick up the current build')
    }
    return rows
  }

  const listRepositories = async (signal: AbortSignal): Promise<readonly GitRepositoryRow[]> => {
    const response = await git().listRepositories({}, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value.repositories
  }

  const status = async (root: string, signal: AbortSignal): Promise<GitStatusView> => {
    const response = await git().status({ root }, signal)
    if (!response.result.ok) throw gitFailure(response.result.error)
    return response.result.value
  }

  const injected = (): RepositoryLocalInjected => ({
    listRepositories,
    status,
  })

  ctx.slots.inject('conversation.view.repositories.section', () => ctx.slots.register({
    name: 'conversation.view.repositories.section',
    id: 'local',
    order: 10,
    locale: NS,
    label: () => t('section.local'),
    inject: injected,
  }, RepositoryLocalSection))
}
