import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import DockerRuntime from '@deepseek-ai/dsh-docker'
import type { DockerComposeResult, DockerContainer, DockerProvider } from '@deepseek-ai/dsh-docker'
import * as ToolDocker from '@deepseek-ai/dsh-tool-docker'
import {
  capLogs,
  capOutput,
  formatComposeOutput,
  formatContainers,
  formatImages,
  parseComposeArgs,
} from '@deepseek-ai/dsh-tool-docker'

const testToolSignal = new AbortController().signal

function container(name: string, overrides: Partial<DockerContainer> = {}): DockerContainer {
  return {
    id: `id-${name}`,
    name,
    image: 'postgres:17',
    state: 'running',
    status: 'Up 3 hours',
    ports: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

/** A scripted backend so the tools run against a real seam without an engine. */
function provider(overrides: Partial<DockerProvider> = {}): DockerProvider {
  const compose: DockerComposeResult = { project: 'lab', output: 'Started', containers: [container('lab-db')] }
  return {
    id: 'stub',
    available: () => Promise.resolve(true),
    list: () => Promise.resolve([container('lab-db', { project: 'lab', service: 'db' })]),
    control: request => Promise.resolve(container(request.container)),
    images: () => Promise.resolve([{ id: 'sha256:aaa', tags: ['app:latest'], size: 1_090_000_000, createdAt: '2026-01-01' }]),
    logs: request => Promise.resolve({ container: request.container, content: 'ready to accept connections', truncated: false }),
    composeUp: () => Promise.resolve(compose),
    composeDown: () => Promise.resolve({ ...compose, output: 'Removed', containers: [] }),
    ...overrides,
  }
}

/** Mount the real tool registry, docker seam, and tool-docker. */
async function mountTools(opts: { config?: ToolDocker.Config; docker?: DockerProvider } = {}): Promise<{
  ctx: Context
  fiber: Awaited<ReturnType<Context['plugin']>>
  call: (name: string, args: unknown) => Promise<ToolExecutionResult>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(DockerRuntime, {})
  ctx.docker.registerProvider(opts.docker ?? provider())
  const fiber = await ctx.plugin(ToolDocker, opts.config ?? { compose: true })
  let counter = 0
  const call = (name: string, args: unknown) => ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++counter}`),
    name,
    arguments: args,
  })
  return { ctx, fiber, call }
}

/** The single text block a settled tool call rendered. */
function text(result: ToolExecutionResult): string {
  const block = result.content[0]
  return block !== undefined && block.type === 'text' ? block.text : ''
}

describe('container formatting', () => {
  it('renders state, status, image, compose scope, and published ports on one line', () => {
    const out = formatContainers([{
      id: 'a',
      name: 'lab-db',
      image: 'postgres:17',
      state: 'running',
      status: 'Up 3 hours',
      project: 'lab',
      service: 'db',
      ports: ['0.0.0.0:5432->5432/tcp'],
      createdAt: 'c',
    }])

    expect(out).toBe('lab-db [lab/db] running (Up 3 hours) image=postgres:17 ports=0.0.0.0:5432->5432/tcp')
  })

  it('omits the compose scope and ports for a container that has neither', () => {
    const out = formatContainers([{
      id: 'a', name: 'scratch', image: 'busybox', state: 'exited', status: 'Exited (0)', ports: [], createdAt: 'c',
    }])

    expect(out).toBe('scratch exited (Exited (0)) image=busybox')
  })

  it('states an empty listing rather than returning empty text the model must guess at', () => {
    expect(formatContainers([])).toBe('No containers matched.')
    expect(formatImages([])).toBe('No images found.')
  })

  it('renders image sizes in human units and marks an untagged image', () => {
    const out = formatImages([
      { id: 'a', tags: ['app:latest', 'app:v2'], size: 1_090_000_000, createdAt: 'c' },
      { id: 'b', tags: [], size: 52_400_000, createdAt: 'c' },
    ])

    expect(out).toBe('app:latest app:v2 1.09GB id=a\n<untagged> 52.4MB id=b')
  })
})

describe('output caps', () => {
  it('keeps the newest log characters, because the tail explains a fresh failure', () => {
    expect(capLogs('abcdef', 3)).toEqual({ text: 'def', dropped: true })
  })

  it('reports nothing dropped when the text already fits', () => {
    expect(capLogs('abc', 3)).toEqual({ text: 'abc', dropped: false })
  })

  it('keeps the newest compose output characters', () => {
    expect(capOutput('abcdef', 2)).toBe('ef')
    expect(capOutput('ab', 4)).toBe('ab')
  })
})

describe('compose argument validation', () => {
  it('rejects a blank compose file', () => {
    expect(() => parseComposeArgs({ file: '  ' })).toThrow(/non-empty compose file path/)
  })

  it('rejects an explicitly empty service list, which reads as a no-op', () => {
    expect(() => parseComposeArgs({ file: 'c.yml', services: [] })).toThrow(/at least one service/)
  })

  it('rejects a blank service name', () => {
    expect(() => parseComposeArgs({ file: 'c.yml', services: ['db', ' '] })).toThrow(/non-empty string/)
  })

  it('collapses duplicate services while keeping first-occurrence order', () => {
    expect(parseComposeArgs({ file: 'c.yml', services: ['db', 'web', 'db'] })).toEqual(['db', 'web'])
  })

  it('treats an absent service list as the whole project', () => {
    expect(parseComposeArgs({ file: 'c.yml' })).toBeUndefined()
  })
})

describe('compose output formatting', () => {
  it('leads with the project state, then the backend output', () => {
    const out = formatComposeOutput({
      project: 'lab',
      output: 'Container lab-db Started',
      containers: [{ id: 'a', name: 'lab-db', image: 'i', state: 'running', status: 's', ports: ['5432'], createdAt: 'c' }],
    })

    expect(out).toBe('Project lab settled.\n- lab-db running (5432)\n\nContainer lab-db Started')
  })

  it('states that no containers remain after a teardown', () => {
    expect(formatComposeOutput({ project: 'lab', output: '', containers: [] }))
      .toBe('Project lab settled.\nNo containers remain.')
  })
})

describe('tool registration', () => {
  it('registers only the read-only tools by default', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(DockerRuntime, {})
    await ctx.plugin(ToolDocker, {})

    const names = ctx.tools.schemas().map(schema => schema.name).sort()

    expect(names).toEqual(['docker_images', 'docker_logs', 'docker_ps'])
  })

  it('registers the compose lifecycle tools when the deployment opts in', async () => {
    const { ctx } = await mountTools()

    const names = ctx.tools.schemas().map(schema => schema.name).sort()

    expect(names).toEqual(['docker_compose_down', 'docker_compose_up', 'docker_images', 'docker_logs', 'docker_ps'])
  })

  it('registers no tools when both groups are disabled', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(DockerRuntime, {})
    await ctx.plugin(ToolDocker, { inspect: false, compose: false })

    expect(ctx.tools.schemas()).toEqual([])
  })

  it('unregisters every tool when its fiber disposes', async () => {
    const { ctx, fiber } = await mountTools()

    await fiber.dispose()

    expect(ctx.tools.schemas()).toEqual([])
  })

  it('rejects a non-positive limit at load rather than at first call', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(DockerRuntime, {})

    await expect(ctx.plugin(ToolDocker, { maxLogChars: 0 }))
      .rejects.toThrow(/maxLogChars must be a positive integer/)
  })

  it('marks reads concurrency-safe and compose lifecycle calls unsafe', async () => {
    const { ctx } = await mountTools()
    const mode = (name: string, args: unknown) =>
      ctx.tools.executionMode({ signal: testToolSignal, callId: CallId(`mode-${name}`), name, arguments: args })

    expect(mode('docker_ps', {})).toMatchObject({ kind: 'parallel' })
    expect(mode('docker_images', {})).toMatchObject({ kind: 'parallel' })
    expect(mode('docker_logs', { container: 'web' })).toMatchObject({ kind: 'parallel' })
    expect(mode('docker_compose_up', { file: 'c.yml' })).not.toMatchObject({ kind: 'parallel' })
    expect(mode('docker_compose_down', { file: 'c.yml' })).not.toMatchObject({ kind: 'parallel' })
  })
})

describe('tool execution', () => {
  it('forwards docker_ps filters to the seam and renders the listing', async () => {
    const list = vi.fn(() => Promise.resolve([container('lab-db', { project: 'lab', service: 'db' })]))
    const { call } = await mountTools({ docker: provider({ list }) })

    const result = await call('docker_ps', { all: true, project: 'lab' })

    expect(list).toHaveBeenCalledWith({ all: true, project: 'lab' }, expect.anything())
    expect(text(result)).toContain('lab-db [lab/db] running')
  })

  it('omits absent optional filters instead of sending explicit undefined', async () => {
    const list = vi.fn(() => Promise.resolve([]))
    const { call } = await mountTools({ docker: provider({ list }) })

    await call('docker_ps', {})

    expect(list).toHaveBeenCalledWith({}, expect.anything())
  })

  it('caps docker_logs output and marks it truncated', async () => {
    const logs = () => Promise.resolve({ container: 'web', content: 'abcdefghij', truncated: false })
    const { call } = await mountTools({ config: { compose: true, maxLogChars: 4 }, docker: provider({ logs }) })

    const result = await call('docker_logs', { container: 'web' })

    expect(text(result)).toBe('(older entries dropped)\nghij')
  })

  it('keeps a seam-reported truncation even when the cap did not trigger', async () => {
    const logs = () => Promise.resolve({ container: 'web', content: 'short', truncated: true })
    const { call } = await mountTools({ docker: provider({ logs }) })

    const result = await call('docker_logs', { container: 'web' })

    expect(text(result)).toContain('(older entries dropped)')
  })

  it('states an empty log range rather than returning blank text', async () => {
    const logs = () => Promise.resolve({ container: 'web', content: '', truncated: false })
    const { call } = await mountTools({ docker: provider({ logs }) })

    const result = await call('docker_logs', { container: 'web' })

    expect(text(result)).toBe('The container produced no log output in this range.')
  })

  it('rejects a blank container and a non-positive tail before reaching the seam', async () => {
    const logs = vi.fn(() => Promise.resolve({ container: 'web', content: '', truncated: false }))
    const { call } = await mountTools({ docker: provider({ logs }) })

    expect((await call('docker_logs', { container: '  ' })).isError).toBe(true)
    expect((await call('docker_logs', { container: 'web', tail: 0 })).isError).toBe(true)

    expect(logs).not.toHaveBeenCalled()
  })

  it('forwards a compose up request and renders the settled project', async () => {
    const composeUp = vi.fn(() => Promise.resolve({ project: 'lab', output: 'Started', containers: [container('lab-db')] }))
    const { call } = await mountTools({ docker: provider({ composeUp }) })

    const result = await call('docker_compose_up', { file: 'lab/compose.yml', project: 'lab', services: ['db', 'db'] })

    expect(composeUp).toHaveBeenCalledWith(
      { file: 'lab/compose.yml', project: 'lab', services: ['db'] },
      expect.anything(),
    )
    expect(text(result)).toContain('Project lab settled.')
  })

  it('never forwards services to compose down, which removes the whole project', async () => {
    const composeDown = vi.fn(() => Promise.resolve({ project: 'lab', output: '', containers: [] }))
    const { call } = await mountTools({ docker: provider({ composeDown }) })

    await call('docker_compose_down', { file: 'lab/compose.yml', project: 'lab', services: ['db'] })

    expect(composeDown).toHaveBeenCalledWith({ file: 'lab/compose.yml', project: 'lab' }, expect.anything())
  })

  it('surfaces an unusable engine as a tool error, keeping the tool registered', async () => {
    const { ctx, call } = await mountTools({ docker: provider({ available: () => Promise.resolve(false) }) })

    const result = await call('docker_ps', {})

    expect(result.isError).toBe(true)
    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('docker_ps')
  })

  it('collapses repeated image ids into their rendered tag list', async () => {
    const { call } = await mountTools()

    const result = await call('docker_images', {})

    expect(text(result)).toBe('app:latest 1.09GB id=sha256:aaa')
  })
})

describe('prompt guidance', () => {
  it('describes the read-only tools and, when enabled, the lifecycle tools', async () => {
    const { ctx } = await mountTools()

    const prompt = await ctx.systemPrompt.assemble()
    const guidance = prompt.sections.map(section => section.text).join('\n')

    expect(guidance).toContain('docker_ps')
    expect(guidance).toContain('docker_compose_up')
  })

  it('omits lifecycle guidance when those tools are not registered', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(DockerRuntime, {})
    await ctx.plugin(ToolDocker, {})

    const prompt = await ctx.systemPrompt.assemble()
    const guidance = prompt.sections.map(section => section.text).join('\n')

    expect(guidance).not.toContain('docker_compose_up')
  })
})
