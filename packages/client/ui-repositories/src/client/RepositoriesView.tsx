/**
 * Repositories conversation view: container shell that discovers and renders
 * section entries (Local, GitHub, GitLab) from the child slot list.
 */
import clsx from 'clsx'
import { useState, useSyncExternalStore } from 'react'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from './contract.ts'
import css from './RepositoriesView.module.css'

/** One section item discovered from the slot registry. */
export interface RepositoriesSectionItem {
  id: string
  label: string
  order?: number
}

/** Injected face providing dynamic section discovery from the slot registry. */
export interface RepositoriesViewInjected {
  readonly sections: {
    readonly list: () => readonly RepositoriesSectionItem[]
    readonly subscribe: (fn: () => void) => () => void
    readonly version: () => number
  }
}

/** Props passed to RepositoriesView. */
export type RepositoriesViewProps =
  PropsRuntime<'conversation.view'>
  & PropsRenderSlots<'conversation.view.repositories.section'>
  & InjectFace<RepositoriesViewInjected>
  & PropsLocale<'repositories'>

/**
 * Render the Repositories conversation view shell.
 * @param props - Slot runtime shares, injected section registry, and locale translator.
 * @returns The repositories navigation shell and active section.
 */
export function RepositoriesView({
  renderSlot,
  sections,
  t,
}: RepositoriesViewProps) {
  useSyncExternalStore(sections.subscribe, sections.version)
  const availableSections = sections.list()

  // Initially select 'local' if present, otherwise first available
  const [selectedId, setSelectedId] = useState<string>('local')

  const activeSection = availableSections.find(s => s.id === selectedId) ?? availableSections[0]

  return (
    <div className={css.root}>
      <header className={css.header}>
        <div className={css.headerTop}>
          <div className={css.titleGroup}>
            <h2 className={css.title}>{t('header.title')}</h2>
            <p className={css.description}>{t('header.description')}</p>
          </div>
        </div>
        {availableSections.length > 0 && (
          <nav className={css.tabBar} aria-label={t('header.title')}>
            {availableSections.map((section) => {
              const isActive = section.id === activeSection?.id
              return (
                <button
                  key={section.id}
                  type="button"
                  className={clsx(css.tabButton, isActive && css.tabButtonActive)}
                  aria-selected={isActive}
                  role="tab"
                  onClick={() => setSelectedId(section.id)}
                >
                  {section.label}
                </button>
              )
            })}
          </nav>
        )}
      </header>

      <main className={css.body}>
        {activeSection !== undefined ? (
          renderSlot('conversation.view.repositories.section', {}, { only: activeSection.id })
        ) : (
          <div className={css.empty}>{t('sections.empty')}</div>
        )}
      </main>
    </div>
  )
}
