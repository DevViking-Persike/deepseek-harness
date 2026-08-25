/**
 * Browser GitHub repository plugin contributing the 'github' section to the
 * repositories view.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-repositories/client'
import { en, NS, zh } from './locales.ts'
import { RepositoryGithubSection } from './RepositoryGithubSection.tsx'

export type { RepositoryGithubProps } from './RepositoryGithubSection.tsx'

/** Required services: the slot registry and locale service. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the GitHub section into the repositories view.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-repository-github: dictionaries')
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('conversation.view.repositories.section', () => ctx.slots.register({
    name: 'conversation.view.repositories.section',
    id: 'github',
    order: 20,
    locale: NS,
    label: () => t('section.github'),
  }, RepositoryGithubSection))
}
