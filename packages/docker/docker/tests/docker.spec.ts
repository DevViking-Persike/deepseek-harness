import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import DockerRuntime, {
  DockerError,
  type DockerComposeResult,
  type DockerContainer,
  type DockerProvider,
} from '@deepseek-ai/dsh-docker'

function container(name: string, overrides: Partial<DockerContainer> = {}): DockerContainer {
  return {
    id: `id-${name}`,
    name,
    image: 'busybox:latest',
    state: 'running',
    status: 'Up 2 minutes',
    ports: [],
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function composeResult(project: string): DockerComposeResult {
  return { project, output: 'done', containers: [container(`${project}-web`, { project })] }
}

/** A scripted backend recording what the seam forwarded to it. */
function makeProvider(id: string, available: boolean, overrides: Partial<DockerProvider> = {}): DockerProvider {
  return {
    id,
    available: () => Promise.resolve(available),
    list: () => Promise.resolve([container(id)]),
    control: request => Promise.resolve(container(request.container)),
    images: () => Promise.resolve([]),
    logs: request => Promise.resolve({ container: request.container, content: `${id} logs`, truncated: false }),
    composeUp: () => Promise.resolve(composeResult(id)),
    composeDown: () => Promise.resolve(composeResult(id)),
    ...overrides,
  }
}

const available = true
const unavailable = false

/** Mount a DockerRuntime on a fresh root context. */
async function mountDocker(
  config: ConstructorParameters<typeof DockerRuntime>[1] = {},
): Promise<{ ctx: Context; docker: DockerRuntime }> {
  const ctx = new Context()
  await ctx.plugin(DockerRuntime, config)
  return { ctx, docker: ctx.docker }
}

describe('DockerRuntime registration', () => {
  it('registers a provider and unregisters it through the returned disposer', async () => {
    const { docker } = await mountDocker()
    const dispose = docker.registerProvider(makeProvider('local', available))
    expect(docker.providerIds()).toEqual(['local'])

    dispose()
    await Promise.resolve()

    expect(docker.providerIds()).toEqual([])
    await expect(docker.list()).rejects.toThrow(DockerError)
  })

  it('rejects a duplicate provider id', async () => {
    const { docker } = await mountDocker()
    docker.registerProvider(makeProvider('local', available))

    expect(() => docker.registerProvider(makeProvider('local', available)))
      .toThrow(expect.objectContaining({ code: 'DOCKER_PROVIDER_DUPLICATE' }) as Error)
  })

  it('removes the provider when the registering fiber disposes', async () => {
    const { ctx, docker } = await mountDocker()
    const fiber = await ctx.plugin({
      inject: ['docker'],
      apply: (child: Context) => {
        child.docker.registerProvider(makeProvider('scoped', available))
      },
    })
    expect(docker.providerIds()).toEqual(['scoped'])

    await fiber.dispose()

    expect(docker.providerIds()).toEqual([])
  })
})

describe('DockerRuntime selection', () => {
  it('uses the only usable provider when none is configured', async () => {
    const { docker } = await mountDocker()
    docker.registerProvider(makeProvider('only', available))

    await expect(docker.list()).resolves.toEqual([container('only')])
  })

  it('skips an unusable provider so a single usable one still resolves', async () => {
    const { docker } = await mountDocker()
    docker.registerProvider(makeProvider('down', unavailable))
    docker.registerProvider(makeProvider('up', available))

    await expect(docker.list()).resolves.toEqual([container('up')])
  })

  it('reports ambiguity rather than picking by registration order', async () => {
    const { docker } = await mountDocker()
    docker.registerProvider(makeProvider('first', available))
    docker.registerProvider(makeProvider('second', available))

    await expect(docker.list()).rejects.toMatchObject({ code: 'DOCKER_PROVIDER_AMBIGUOUS' })
  })

  it('reports an unavailable capability when no provider is usable', async () => {
    const { docker } = await mountDocker()
    docker.registerProvider(makeProvider('down', unavailable))

    await expect(docker.list()).rejects.toMatchObject({ code: 'DOCKER_PROVIDER_UNAVAILABLE' })
  })

  it('honors a configured provider over registration order', async () => {
    const { docker } = await mountDocker({ provider: 'second' })
    docker.registerProvider(makeProvider('first', available))
    docker.registerProvider(makeProvider('second', available))

    await expect(docker.list()).resolves.toEqual([container('second')])
  })

  it('reports a configured provider that is not registered', async () => {
    const { docker } = await mountDocker({ provider: 'absent' })
    docker.registerProvider(makeProvider('present', available))

    await expect(docker.list()).rejects.toMatchObject({ code: 'DOCKER_PROVIDER_CONFIGURED_MISSING' })
  })

  it('reports a configured provider whose engine is unreachable', async () => {
    const { docker } = await mountDocker({ provider: 'down' })
    docker.registerProvider(makeProvider('down', unavailable))

    await expect(docker.list()).rejects.toMatchObject({ code: 'DOCKER_PROVIDER_CONFIGURED_UNAVAILABLE' })
  })

  it('re-probes availability on every call, so a daemon that stops fails selection', async () => {
    const { docker } = await mountDocker()
    let up = true
    docker.registerProvider(makeProvider('flaky', available, { available: () => Promise.resolve(up) }))
    await expect(docker.list()).resolves.toEqual([container('flaky')])

    up = false

    await expect(docker.list()).rejects.toMatchObject({ code: 'DOCKER_PROVIDER_UNAVAILABLE' })
  })
})

describe('DockerRuntime execution', () => {
  it('forwards every operation and its cancellation signal to the selected provider', async () => {
    const { docker } = await mountDocker()
    const list = vi.fn(() => Promise.resolve([container('local')]))
    const images = vi.fn(() => Promise.resolve([]))
    const logs = vi.fn(() => Promise.resolve({ container: 'web', content: 'out', truncated: false }))
    const composeUp = vi.fn(() => Promise.resolve(composeResult('lab')))
    const composeDown = vi.fn(() => Promise.resolve(composeResult('lab')))
    docker.registerProvider(makeProvider('local', available, { list, images, logs, composeUp, composeDown }))
    const signal = new AbortController().signal

    await docker.list({ all: true, project: 'lab' }, signal)
    await docker.images(signal)
    await docker.logs({ container: 'web', tail: 20 }, signal)
    await docker.composeUp({ file: 'docker-compose.yml', services: ['web'] }, signal)
    await docker.composeDown({ file: 'docker-compose.yml' }, signal)

    expect(list).toHaveBeenCalledWith({ all: true, project: 'lab' }, signal)
    expect(images).toHaveBeenCalledWith(signal)
    expect(logs).toHaveBeenCalledWith({ container: 'web', tail: 20 }, signal)
    expect(composeUp).toHaveBeenCalledWith({ file: 'docker-compose.yml', services: ['web'] }, signal)
    expect(composeDown).toHaveBeenCalledWith({ file: 'docker-compose.yml' }, signal)
  })

  it('lets a provider failure reach the caller unchanged', async () => {
    const { docker } = await mountDocker()
    const failure = new DockerError('engine refused', 'DOCKER_ENGINE_FAILED')
    docker.registerProvider(makeProvider('local', available, { list: () => Promise.reject(failure) }))

    await expect(docker.list()).rejects.toBe(failure)
  })
})
