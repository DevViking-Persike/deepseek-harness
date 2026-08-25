/**
 * Browser GitLab repository plugin contributing the 'gitlab' section to the
 * repositories view.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-repositories/client'
import { en, NS, zh } from './locales.ts'
import { RepositoryGitlabSection } from './RepositoryGitlabSection.tsx'

export type { RepositoryGitlabProps } from './RepositoryGitlabSection.tsx'

/** Required services: the slot registry and locale service. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the GitLab section into the repositories view.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-repository-gitlab: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('conversation.view.repositories.section', () => ctx.slots.register({
    name: 'conversation.view.repositories.section',
    id: 'gitlab',
    order: 30,
    locale: NS,
    label: () => t('section.gitlab'),
  }, RepositoryGitlabSection))
}
