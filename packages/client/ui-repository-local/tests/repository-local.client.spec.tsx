// @vitest-environment jsdom
/**
 * Presentation tests for RepositoryLocalSection.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { GitUnavailable, RepositoryLocalSection } from '../src/client/RepositoryLocalSection.tsx'
import type { GitRepositoryRow, GitStatusView, RepositoryLocalProps } from '../src/client/RepositoryLocalSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

function mount(overrides: Partial<RepositoryLocalProps> = {}) {
  const defaultRepos: GitRepositoryRow[] = [
    { root: '/workspace/project-a', name: 'project-a', workspaceTitle: 'Workspace 1', submodule: false },
    { root: '/workspace/project-b', name: 'project-b', workspaceTitle: 'Workspace 2', submodule: true },
  ]
  const defaultStatus: GitStatusView = {
    root: '/workspace/project-a',
    branch: 'main',
    upstream: 'origin/main',
    ahead: 2,
    behind: 0,
    changes: [
      {
        path: 'src/index.ts',
        absolutePath: '/workspace/project-a/src/index.ts',
        index: 'unmodified',
        worktree: 'modified',
        binary: false,
      },
    ],
    truncated: false,
  }

  const listRepositories = vi.fn(() => Promise.resolve(defaultRepos))
  const status = vi.fn(() => Promise.resolve(defaultStatus))

  const props: RepositoryLocalProps = {
    listRepositories,
    status,
    t: makeTranslate(en),
    ...overrides,
  } as unknown as RepositoryLocalProps

  const result = render(<RepositoryLocalSection {...props} />)
  return { props, listRepositories, status, ...result }
}

describe('RepositoryLocalSection', () => {
  it('renders repository list and selects first repository by default', async () => {
    mount()
    expect(await screen.findByText('project-b')).toBeTruthy()
    expect(screen.getAllByText('project-a').length).toBeGreaterThan(0)
    expect(screen.getByText(en['repo.submodule'])).toBeTruthy()
    expect(screen.getByText('main')).toBeTruthy()
    expect(screen.getByText('origin/main')).toBeTruthy()
    expect(screen.getByText('src/index.ts')).toBeTruthy()
  })

  it('renders empty notice when no repositories are found', async () => {
    mount({
      listRepositories: () => Promise.resolve([]),
    })
    expect(await screen.findByText(en['empty.title'])).toBeTruthy()
  })

  it('renders unavailable notice when Git is not available', async () => {
    mount({
      listRepositories: () => Promise.reject(new GitUnavailable('No git backend')),
    })
    expect(await screen.findByText(en['unavailable.title'])).toBeTruthy()
    expect(await screen.findByText('No git backend')).toBeTruthy()
  })

  it('renders error notice and retries on failure', async () => {
    const listRepositories = vi.fn()
      .mockRejectedValueOnce(new Error('Connection error'))
      .mockResolvedValueOnce([])
    mount({ listRepositories })
    expect(await screen.findByText(en['error.title'])).toBeTruthy()
    expect(await screen.findByText('Connection error')).toBeTruthy()

    const retryBtn = screen.getByRole('button', { name: en['error.retry'] })
    fireEvent.click(retryBtn)

    expect(await screen.findByText(en['empty.title'])).toBeTruthy()
  })

  it('switches selected repository when clicked', async () => {
    const status = vi.fn((root: string) => Promise.resolve({
      root,
      branch: root.includes('project-b') ? 'feature/x' : 'main',
      ahead: 0,
      behind: 0,
      changes: [],
      truncated: false,
    }))
    mount({ status })

    expect(await screen.findByText('project-b')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /project-b/i }))

    expect(await screen.findByText('feature/x')).toBeTruthy()
    expect(await screen.findByText(en['status.clean'])).toBeTruthy()
  })
})
