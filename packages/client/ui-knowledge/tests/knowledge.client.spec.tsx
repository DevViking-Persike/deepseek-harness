// @vitest-environment jsdom
/**
 * The Knowledge settings section: it reports which root supplied each skill,
 * reads decision records and documentation through the workspace file calls,
 * and treats an absent knowledge directory as ordinary rather than broken.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KnowledgeSection, originOf, treadmillTemplate } from '../src/client/KnowledgeSection.tsx'
import type { KnowledgeSectionProps } from '../src/client/KnowledgeSection.tsx'
import { apply as nodeApply } from '../src/index.ts'
import { inject } from '../src/client/index.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/** Interpolate `{name}` placeholders the way the locale service does. */
function makeTranslate(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string>) => {
    const template = dict[key] ?? key
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (_m, name: string) => params[name] ?? '')
  }
}

const TREADMILL = {
  root: '/home/user/.dsh/treadmill',
  enabled: true,
  files: [
    { path: 'esteira/pipeline.yaml', category: 'esteira', size: 1200 },
    { path: 'skills/discovery/SKILL.md', category: 'skills', size: 3400 },
    { path: 'rules/eng/01-file-size.md', category: 'rules', size: 800 },
    { path: 'LICENSE', category: 'LICENSE', size: 10 },
  ],
}

const SKILLS = [
  { name: 'dsh-code-review', description: 'Review a PR', modelInvocable: true, source: 'project-agents' },
  { name: 'archify', description: 'Draw diagrams', modelInvocable: true, source: 'user-agents' },
  { name: 'cordis-plugin-development', description: 'Build plugins', modelInvocable: false, source: 'custom' },
]

/** Render the section over scripted wire calls. */
function mount(overrides: Partial<KnowledgeSectionProps> = {}) {
  const props = {
    listSkills: overrides.listSkills ?? (() => Promise.resolve(SKILLS)),
    listDir: overrides.listDir ?? ((path: string | undefined) => path === '.agents/notes/implemented'
      ? Promise.resolve({
        path: '/w/.agents/notes/implemented',
        root: '/w',
        entries: [
          { name: 'adr-001.md', path: '/w/.agents/notes/implemented/adr-001.md', directory: false },
          { name: 'image.png', path: '/w/.agents/notes/implemented/image.png', directory: false },
        ],
      })
      : Promise.reject(new Error('ENOENT'))),
    readFile: overrides.readFile ?? (() => Promise.resolve({ content: '# A decision\n' })),
    editFile: overrides.editFile ?? (() => Promise.resolve()),
    describeTreadmill: overrides.describeTreadmill ?? (() => Promise.resolve(TREADMILL)),
    readTreadmillFile: overrides.readTreadmillFile ?? ((path: string) => Promise.resolve(`# ${path}\n`)),
    writeTreadmillFile: overrides.writeTreadmillFile ?? (() => Promise.resolve()),
    setTreadmillEnabled: overrides.setTreadmillEnabled ?? (() => Promise.resolve()),
    t: makeTranslate(zh),
  } as unknown as KnowledgeSectionProps
  return render(<KnowledgeSection {...props} />)
}

describe('origin grouping', () => {
  it('separates a project root from a global one', () => {
    // The two behave identically at the prompt and differently for everyone
    // else, which is the whole reason the column exists.
    expect(originOf('project-agents')).toBe('project')
    expect(originOf('project-dsh')).toBe('project')
    expect(originOf('user-agents')).toBe('user')
    expect(originOf('user-dsh')).toBe('user')
  })

  it('treats anything the composition supplies as built in', () => {
    expect(originOf('custom')).toBe('composition')
    expect(originOf('bundled')).toBe('composition')
    expect(originOf('runtime')).toBe('composition')
  })
})

describe('the skills pane', () => {
  it('declares only the services it uses, and the node half adds no host behavior', () => {
    expect(inject).toEqual(['slots', 'connection', 'locale', 'sessions'])
    expect(() => { nodeApply() }).not.toThrow()
  })

  it('labels each skill with the root that supplied it', async () => {
    mount()

    await screen.findByText('dsh-code-review')

    expect(screen.getByText('dsh-code-review').closest('li')?.textContent).toContain(zh['origin.project'])
    expect(screen.getByText('archify').closest('li')?.textContent).toContain(zh['origin.user'])
    expect(screen.getByText('cordis-plugin-development').closest('li')?.textContent)
      .toContain(zh['origin.composition'])
  })

  it('separates a model-invocable skill from a user-only one', async () => {
    mount()

    await screen.findByText('archify')

    expect(screen.getByText('archify').closest('li')?.textContent).toContain(zh['skills.modelInvocable'])
    expect(screen.getByText('cordis-plugin-development').closest('li')?.textContent)
      .toContain(zh['skills.userOnly'])
  })

  it('reports how many are reachable', async () => {
    mount()

    expect(await screen.findByText(zh['skills.count'].replace('{count}', '3'))).toBeTruthy()
  })

  it('says so plainly when a session reaches none', async () => {
    mount({ listSkills: () => Promise.resolve([]) })

    expect(await screen.findByText(zh.empty)).toBeTruthy()
  })

  it('reports a failed read instead of an empty catalog', async () => {
    mount({ listSkills: () => Promise.reject(new Error('no seam')) })

    expect(await screen.findByText(zh.failed.replace('{reason}', 'no seam'))).toBeTruthy()
  })
})

describe('the document panes', () => {
  it('lists only Markdown, ignoring other files in the directory', async () => {
    mount()

    fireEvent.click(await screen.findByText(zh['tab.decisions']))

    await waitFor(() => { expect(screen.queryByText(/adr-001\.md/)).not.toBeNull() })
    expect(screen.queryByText(/image\.png/)).toBeNull()
  })

  it('treats an absent knowledge directory as ordinary, not as a failure', async () => {
    // A project without docs/adr is normal; reporting it as an error would
    // train the operator to ignore the pane.
    const listDir = vi.fn((path: string | undefined) => path === 'docs'
      ? Promise.resolve({
        path: '/w/docs',
        root: '/w',
        entries: [{ name: 'guide.md', path: '/w/docs/guide.md', directory: false }],
      })
      : Promise.reject(new Error('ENOENT')))
    mount({ listDir })

    fireEvent.click(await screen.findByText(zh['tab.docs']))

    await waitFor(() => { expect(screen.queryByText(/guide\.md/)).not.toBeNull() })
    expect(screen.queryByText(zh.failed.replace('{reason}', 'ENOENT'))).toBeNull()
  })

  it('descends one level, because a record is filed under its kind', async () => {
    // Notes live in implemented/architecture, not implemented/; listing only
    // the top level finds the few files beside those directories and misses
    // the record set entirely.
    const listDir = vi.fn((path: string | undefined) => {
      if (path === '.agents/notes/implemented') {
        return Promise.resolve({
          path: '/w/x', root: '/w',
          entries: [
            { name: 'architecture', path: '/w/x/architecture', directory: true },
            { name: 'AGENTS.md', path: '/w/x/AGENTS.md', directory: false },
          ],
        })
      }
      if (path === '.agents/notes/implemented/architecture') {
        return Promise.resolve({
          path: '/w/x/architecture', root: '/w',
          entries: [{ name: 'deep-note.md', path: '/w/x/architecture/deep-note.md', directory: false }],
        })
      }
      return Promise.reject(new Error('ENOENT'))
    })
    mount({ listDir })

    fireEvent.click(await screen.findByText(zh['tab.decisions']))

    await waitFor(() => { expect(screen.queryByText(/deep-note\.md/)).not.toBeNull() })
    // A directory's own AGENTS.md describes the folder; it is not a record.
    expect(screen.queryByText(/AGENTS\.md/)).toBeNull()
  })

  it('narrows a large record set by name', async () => {
    const listDir = vi.fn((path: string | undefined) => path === '.agents/notes/implemented'
      ? Promise.resolve({
        path: '/w/x', root: '/w',
        entries: [
          { name: 'alpha-note.md', path: '/w/x/alpha-note.md', directory: false },
          { name: 'beta-note.md', path: '/w/x/beta-note.md', directory: false },
        ],
      })
      : Promise.reject(new Error('ENOENT')))
    mount({ listDir })
    fireEvent.click(await screen.findByText(zh['tab.decisions']))
    await screen.findByText(/alpha-note\.md/)

    fireEvent.change(screen.getByPlaceholderText(zh.filter), { target: { value: 'beta' } })

    expect(screen.queryByText(/alpha-note\.md/)).toBeNull()
    expect(screen.queryByText(/beta-note\.md/)).not.toBeNull()
  })

  it('opens a document and shows its text', async () => {
    mount()
    fireEvent.click(await screen.findByText(zh['tab.decisions']))
    await screen.findByText(/adr-001\.md/)

    fireEvent.click(screen.getByText(zh.open))

    expect(await screen.findByText('# A decision')).toBeTruthy()
  })

  it('returns from an opened document to its list', async () => {
    mount()
    fireEvent.click(await screen.findByText(zh['tab.decisions']))
    await screen.findByText(/adr-001\.md/)
    fireEvent.click(screen.getByText(zh.open))
    await screen.findByText('# A decision')

    fireEvent.click(screen.getByText(zh.back))

    expect(await screen.findByText(/adr-001\.md/)).toBeTruthy()
  })

  it('shows the reason inline when a document cannot be read', async () => {
    mount({ readFile: () => Promise.reject(new Error('not text')) })
    fireEvent.click(await screen.findByText(zh['tab.decisions']))
    await screen.findByText(/adr-001\.md/)

    fireEvent.click(screen.getByText(zh.open))

    expect(await screen.findByText('not text')).toBeTruthy()
  })
})

describe('Skills-treadmill pane', () => {
  it('lists the installation by category, edits a file, and saves it', async () => {
    const writes: [string, string][] = []
    mount({ writeTreadmillFile: (path, content) => { writes.push([path, content]); return Promise.resolve() } })
    fireEvent.click(screen.getByRole('button', { name: zh['tab.treadmill'] }))
    expect(await screen.findByText('esteira/pipeline.yaml')).toBeTruthy()
    expect(screen.getByText(zh['treadmill.category.esteira'])).toBeTruthy()
    expect(screen.getByText(zh['treadmill.category.other'])).toBeTruthy()
    expect(screen.getByText(zh['treadmill.enabled'])).toBeTruthy()
    const [editButton] = screen.getAllByRole('button', { name: zh['edit'] })
    if (editButton === undefined) throw new Error('no edit button')
    fireEvent.click(editButton)
    const editor = await screen.findByRole('textbox')
    expect((editor as HTMLTextAreaElement).value).toBe('# esteira/pipeline.yaml\n')
    fireEvent.change(editor, { target: { value: 'schema: 1\nstages: []\n' } })
    fireEvent.click(screen.getByRole('button', { name: zh['treadmill.save'] }))
    expect(await screen.findByText(zh['treadmill.saved'])).toBeTruthy()
    expect(writes).toEqual([['esteira/pipeline.yaml', 'schema: 1\nstages: []\n']])
  })

  it('switches the Treadmill off through the toggle and reports a broken stage table', async () => {
    const toggles: boolean[] = []
    let enabled = true
    mount({
      describeTreadmill: () => Promise.resolve({ ...TREADMILL, enabled, ...enabled ? {} : { pipelineError: 'duplicate stage id "a"' } }),
      setTreadmillEnabled: (next) => { toggles.push(next); enabled = next; return Promise.resolve() },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['tab.treadmill'] }))
    const toggle = await screen.findByRole('checkbox')
    fireEvent.click(toggle)
    expect(toggles).toEqual([false])
    expect(await screen.findByText(zh['treadmill.disabled'])).toBeTruthy()
    expect(screen.getByText(/duplicate stage id/)).toBeTruthy()
  })

  it('reports an installation that cannot be described or read', async () => {
    mount({ describeTreadmill: () => Promise.reject(new Error('treadmill-unavailable: absent')) })
    fireEvent.click(screen.getByRole('button', { name: zh['tab.treadmill'] }))
    expect(await screen.findByText(/treadmill-unavailable/)).toBeTruthy()
    cleanup()
    mount({ readTreadmillFile: () => Promise.reject(new Error('gone')) })
    fireEvent.click(screen.getByRole('button', { name: zh['tab.treadmill'] }))
    const [editButton] = await screen.findAllByRole('button', { name: zh['edit'] })
    if (editButton === undefined) throw new Error('no edit button')
    fireEvent.click(editButton)
    expect(await screen.findByText(/gone/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['treadmill.cancel'] }))
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

describe('Skills-treadmill creation', () => {
  it('creates a skill from its template and opens it in the editor', async () => {
    const writes: [string, string][] = []
    mount({ writeTreadmillFile: (path, content) => { writes.push([path, content]); return Promise.resolve() } })
    fireEvent.click(screen.getByRole('button', { name: zh['tab.treadmill'] }))
    await screen.findByText('esteira/pipeline.yaml')
    const [newSkill] = screen.getAllByRole('button', { name: zh['treadmill.new'] })
    if (newSkill === undefined) throw new Error('no new button')
    fireEvent.click(newSkill)
    const name = screen.getByRole('textbox', { name: zh['treadmill.newName'] })
    fireEvent.change(name, { target: { value: 'Bad Name' } })
    fireEvent.click(screen.getByRole('button', { name: zh['treadmill.create'] }))
    expect(screen.getByText(zh['treadmill.invalidName'])).toBeTruthy()
    expect(writes).toEqual([])
    fireEvent.change(name, { target: { value: 'my-skill' } })
    fireEvent.click(screen.getByRole('button', { name: zh['treadmill.create'] }))
    const editor = await screen.findByRole('textbox')
    expect(writes).toHaveLength(1)
    expect(writes[0]?.[0]).toBe('skills/my-skill/SKILL.md')
    expect((editor as HTMLTextAreaElement).value).toContain('name: my-skill')
  })

  it('maps every creatable category to its entry file', () => {
    expect(treadmillTemplate('skills', 'a')?.path).toBe('skills/a/SKILL.md')
    expect(treadmillTemplate('commands', 'a')?.path).toBe('commands/a.md')
    expect(treadmillTemplate('agents', 'a')?.path).toBe('agents/a.md')
    expect(treadmillTemplate('rules', 'a')?.path).toBe('rules/a.md')
    expect(treadmillTemplate('tools', 'a')?.path).toBe('tools/a.sh')
    expect(treadmillTemplate('integrations', 'a')?.path).toBe('integrations/a/README.md')
    expect(treadmillTemplate('esteira', 'a')).toBeUndefined()
    expect(treadmillTemplate('other', 'a')).toBeUndefined()
  })
})
