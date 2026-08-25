// @vitest-environment jsdom
/**
 * Presentation tests for RepositoriesView.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { RepositoriesView } from '../src/client/RepositoriesView.tsx'
import type { RepositoriesSectionItem, RepositoriesViewProps } from '../src/client/RepositoriesView.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function mount(overrides: Partial<RepositoriesViewProps> = {}) {
  const sectionsList: RepositoriesSectionItem[] = [
    { id: 'local', label: 'Local', order: 10 },
    { id: 'github', label: 'GitHub', order: 20 },
    { id: 'gitlab', label: 'GitLab', order: 30 },
  ]
  const renderSlot = vi.fn((_name: string, _owner: unknown, opts?: { only?: string }) => (
    <div data-testid={`slot-${opts?.only}`}>Section Content: {opts?.only}</div>
  ))

  const props: RepositoriesViewProps = {
    renderSlot: renderSlot as never,
    sections: {
      list: () => sectionsList,
      subscribe: () => () => {},
      version: () => 1,
    },
    t: makeTranslate(en),
    ...overrides,
  } as unknown as RepositoriesViewProps

  const result = render(<RepositoriesView {...props} />)
  return { props, renderSlot, ...result }
}

describe('RepositoriesView', () => {
  it('renders header title and description', () => {
    mount()
    expect(screen.getByRole('heading', { level: 2, name: en['header.title'] })).toBeTruthy()
    expect(screen.getByText(en['header.description'])).toBeTruthy()
  })

  it('renders empty message when no sections are available', () => {
    mount({
      sections: {
        list: () => [],
        subscribe: () => () => {},
        version: () => 1,
      },
    })
    expect(screen.getByText(en['sections.empty'])).toBeTruthy()
  })

  it('selects Local initially by default and renders only that section slot', () => {
    const { renderSlot } = mount()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs[0]?.textContent).toBe('Local')
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('false')
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('false')

    expect(renderSlot).toHaveBeenCalledWith(
      'conversation.view.repositories.section',
      expect.anything(),
      { only: 'local' },
    )
    expect(screen.getByTestId('slot-local')).toBeTruthy()
  })

  it('switches tabs on click and renders the newly selected section', () => {
    const { renderSlot } = mount()
    const githubTab = screen.getByRole('tab', { name: 'GitHub' })
    fireEvent.click(githubTab)

    expect(githubTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Local' }).getAttribute('aria-selected')).toBe('false')

    expect(renderSlot).toHaveBeenLastCalledWith(
      'conversation.view.repositories.section',
      expect.anything(),
      { only: 'github' },
    )
    expect(screen.getByTestId('slot-github')).toBeTruthy()
  })
})
