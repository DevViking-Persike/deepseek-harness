/**
 * Browser repositories plugin contributing one entry to the conversation view
 * slot and declaring the child slot list 'conversation.view.repositories.section'.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from './contract.ts'
import { en, NS, zh } from './locales.ts'
import { RepositoriesView } from './RepositoriesView.tsx'
import type { RepositoriesSectionItem, RepositoriesViewInjected } from './RepositoriesView.tsx'

export type {
  RepositoriesSectionItem,
  RepositoriesViewInjected,
  RepositoriesViewProps,
} from './RepositoriesView.tsx'
export type { RepositoriesSectionOwnerProps } from './contract.ts'

/** Required services: the slot registry and the locale service. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the repositories view tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-repositories: dictionaries')
  const t = ctx.locale.bind(NS)

  const sections = {
    list: (): readonly RepositoriesSectionItem[] => {
      const entries: RepositoriesSectionItem[] = []
      for (const entry of ctx.slots.entries('conversation.view.repositories.section')) {
        /* v8 ignore next -- unreachable: list registration validates id at load. */
        if (entry.options.id === undefined) continue
        entries.push({
          id: entry.options.id,
          label: resolveSlotLabel(entry.options.label) ?? entry.options.id,
          // exactOptionalPropertyTypes: an absent order must stay absent, not
          // become an explicit undefined.
          ...(entry.options.order !== undefined ? { order: entry.options.order } : {}),
        })
      }
      return entries
    },
    subscribe: (fn: () => void) => ctx.slots.subscribe('conversation.view.repositories.section', fn),
    version: () => ctx.slots.getVersion('conversation.view.repositories.section'),
  }

  const makeInjected = (): RepositoriesViewInjected => ({
    sections,
  })

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'repositories',
    order: 40,
    locale: NS,
    label: () => t('view.repositories'),
    children: {
      'conversation.view.repositories.section': { kind: 'list', scope: 'session' },
    },
    inject: makeInjected,
  }, RepositoriesView))
}
