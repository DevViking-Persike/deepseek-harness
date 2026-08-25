// @vitest-environment jsdom
/**
 * Presentation tests for RepositoryGitlabSection.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { RepositoryGitlabSection } from '../src/client/RepositoryGitlabSection.tsx'
import type { RepositoryGitlabProps } from '../src/client/RepositoryGitlabSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

describe('RepositoryGitlabSection', () => {
  it('renders honest unconfigured provider state and integration details', () => {
    const props: RepositoryGitlabProps = {
      t: makeTranslate(en),
    } as unknown as RepositoryGitlabProps

    render(<RepositoryGitlabSection {...props} />)

    expect(screen.getByText(en['header.title'])).toBeTruthy()
    expect(screen.getByText(en['status.unconfigured'])).toBeTruthy()
    expect(screen.getByText(en['notice.title'])).toBeTruthy()
    expect(screen.getByText(en['notice.description'])).toBeTruthy()
    expect(screen.getByText(en['features.title'])).toBeTruthy()
    expect(screen.getByText(en['features.clone'])).toBeTruthy()
    expect(screen.getByText(en['guide.title'])).toBeTruthy()
    expect(screen.getByText(en['guide.step1'])).toBeTruthy()
  })
})
