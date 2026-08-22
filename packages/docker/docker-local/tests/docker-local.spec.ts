import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import DockerRuntime from '@deepseek-ai/dsh-docker'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as dockerLocal from '@deepseek-ai/dsh-docker-local'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-docker-local-spec-'))

/** One scripted `docker <subcommand>` outcome. */
interface Scripted {
  readonly exitCode?: number
  readonly stdout?: string
  readonly stderr?: string
}

/**
 * Write an executable stand-in for the `docker` CLI that answers each
 * subcommand from `script` and appends every argv it received to a log file.
 * The provider runs through the real subprocess seam, so argv construction,
 * flag terminators, exit-code classification, and output collection are all
 * exercised end to end.
 */
function fakeDockerCli(script: Record<string, Scripted>): { cli: string; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-docker-cli-'))
  const cli = join(dir, 'docker')
  const log = join(dir, 'argv.log')
  const cases = Object.entries(script).map(([subcommand, outcome]) => {
    const stdout = outcome.stdout ?? ''
    const stderr = outcome.stderr ?? ''
    return [
      `  ${subcommand})`,
      stdout.length === 0 ? '    :' : `    printf '%s' ${shellQuote(stdout)}`,
      stderr.length === 0 ? '    :' : `    printf '%s' ${shellQuote(stderr)} >&2`,
      `    exit ${String(outcome.exitCode ?? 0)}`,
      '    ;;',
    ].join('\n')
  })
  writeFileSync(cli, [
    '#!/bin/sh',
    `printf '%s\\n' "$* cwd=$(pwd)" >> ${shellQuote(log)}`,
    'case "$1" in',
    ...cases,
    '  *)',
    '    exit 0',
    '    ;;',
    'esac',
  ].join('\n') + '\n')
  chmodSync(cli, 0o755)
  return { cli, log }
}

/** Single-quote a value for the POSIX shell the stub script is written in. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Every argv line the stub recorded, oldest first, with the trailing `cwd=`
 * marker the stub appends removed.
 */
function recordedArgv(log: string): string[] {
  try {
    return readFileSync(log, 'utf8')
      .split('\n')
      .filter(line => line.length > 0)
      .map(line => line.replace(/ cwd=.*$/, ''))
  } catch {
    // No invocation reached the stub, so it never created its log.
    return []
  }
}

/** Mount the real subprocess seam, the docker seam, and the local provider over a stub CLI. */
async function mountLocal(
  script: Record<string, Scripted>,
  config: Partial<dockerLocal.Config> = {},
): Promise<{ ctx: Context; log: string }> {
  const { cli, log } = fakeDockerCli(script)
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  await ctx.plugin(DockerRuntime, {})
  await ctx.plugin(dockerLocal, { cli, projectRoot: tmpdir(), ...config })
  return { ctx, log }
}

const PS_JSON = [
  '{"ID":"abc123","Names":"lab-db","Image":"postgres:17","State":"running","Status":"Up 3 hours",'
  + '"Ports":"0.0.0.0:5432->5432/tcp","CreatedAt":"2026-01-01 10:00:00 +0000 UTC",'
  + '"Labels":"com.docker.compose.project=lab,com.docker.compose.service=db"}',
  '{"ID":"def456","Names":"scratch","Image":"busybox","State":"exited","Status":"Exited (0)",'
  + '"Ports":"","CreatedAt":"2026-01-02 10:00:00 +0000 UTC","Labels":""}',
].join('\n')

describe('local docker provider registration', () => {
  it('registers with the seam and unregisters when its fiber disposes', async () => {
    const { cli } = fakeDockerCli({})
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(DockerRuntime, {})
    const fiber = await ctx.plugin(dockerLocal, { cli, projectRoot: tmpdir() })
    expect(ctx.docker.providerIds()).toEqual(['local'])

    await fiber.dispose()

    expect(ctx.docker.providerIds()).toEqual([])
  })

  it('rejects a non-positive limit at load rather than at first use', async () => {
    const { cli } = fakeDockerCli({})
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(DockerRuntime, {})

    await expect(ctx.plugin(dockerLocal, { cli, projectRoot: tmpdir(), defaultLogTail: 0 }))
      .rejects.toThrow(/defaultLogTail must be a positive integer/)
  })
})

describe('local docker provider availability', () => {
  it('reports availability from the engine-side info call', async () => {
    const { ctx, log } = await mountLocal({ info: { exitCode: 0, stdout: '27.0.1' } })

    await expect(ctx.docker.list()).resolves.toEqual([])

    expect(recordedArgv(log)[0]).toBe('info --format {{.ServerVersion}}')
  })

  it('treats an unreachable daemon as an unusable provider, not a thrown engine error', async () => {
    const { ctx } = await mountLocal({ info: { exitCode: 1, stderr: 'Cannot connect to the Docker daemon' } })

    await expect(ctx.docker.list()).rejects.toMatchObject({ code: 'DOCKER_PROVIDER_UNAVAILABLE' })
  })
})

describe('local docker provider listing', () => {
  it('parses containers and reads compose labels into project and service', async () => {
    const { ctx } = await mountLocal({ info: {}, ps: { stdout: PS_JSON } })

    await expect(ctx.docker.list({ all: true })).resolves.toEqual([
      {
        id: 'abc123',
        name: 'lab-db',
        image: 'postgres:17',
        state: 'running',
        status: 'Up 3 hours',
        project: 'lab',
        service: 'db',
        ports: ['0.0.0.0:5432->5432/tcp'],
        createdAt: '2026-01-01 10:00:00 +0000 UTC',
      },
      {
        id: 'def456',
        name: 'scratch',
        image: 'busybox',
        state: 'exited',
        status: 'Exited (0)',
        ports: [],
        createdAt: '2026-01-02 10:00:00 +0000 UTC',
      },
    ])
  })

  it('passes all and project as CLI flags rather than filtering in memory', async () => {
    const { ctx, log } = await mountLocal({ info: {}, ps: { stdout: '' } })

    await ctx.docker.list({ all: true, project: 'lab' })

    expect(recordedArgv(log).at(-1))
      .toBe('ps --format json --no-trunc --all --filter label=com.docker.compose.project=lab')
  })

  it('skips CLI warning lines interleaved with JSON rows', async () => {
    const stdout = `WARNING: daemon is running in rootless mode\n${PS_JSON.split('\n')[0]!}\n`
    const { ctx } = await mountLocal({ info: {}, ps: { stdout } })

    await expect(ctx.docker.list()).resolves.toHaveLength(1)
  })

  it('maps an unknown engine state word onto the closed union', async () => {
    const stdout = '{"ID":"x","Names":"n","Image":"i","State":"removing","Status":"s","Ports":"","CreatedAt":"c","Labels":""}'
    const { ctx } = await mountLocal({ info: {}, ps: { stdout } })

    const [only] = await ctx.docker.list()

    expect(only?.state).toBe('dead')
  })

  it('classifies a missing object as not-found and other failures as engine failures', async () => {
    const missing = await mountLocal({ info: {}, ps: { exitCode: 1, stderr: 'Error: No such container: ghost' } })
    await expect(missing.ctx.docker.list()).rejects.toMatchObject({ code: 'DOCKER_NOT_FOUND' })

    const broken = await mountLocal({ info: {}, ps: { exitCode: 1, stderr: 'permission denied' } })
    await expect(broken.ctx.docker.list()).rejects.toMatchObject({ code: 'DOCKER_ENGINE_FAILED' })
  })
})

describe('local docker provider images', () => {
  it('collapses repeated tags of one image id into a single entry', async () => {
    const stdout = [
      '{"ID":"sha256:aaa","Repository":"app","Tag":"latest","Size":"1.09GB","CreatedAt":"2026-01-01"}',
      '{"ID":"sha256:aaa","Repository":"app","Tag":"v2","Size":"1.09GB","CreatedAt":"2026-01-01"}',
      '{"ID":"sha256:bbb","Repository":"<none>","Tag":"<none>","Size":"52.4MB","CreatedAt":"2026-01-02"}',
    ].join('\n')
    const { ctx } = await mountLocal({ info: {}, images: { stdout } })

    await expect(ctx.docker.images()).resolves.toEqual([
      { id: 'sha256:aaa', tags: ['app:latest', 'app:v2'], size: 1_090_000_000, createdAt: '2026-01-01' },
      { id: 'sha256:bbb', tags: [], size: 52_400_000, createdAt: '2026-01-02' },
    ])
  })
})

describe('local docker provider logs', () => {
  it('passes the container after a flag terminator so a dash-leading name stays an operand', async () => {
    const { ctx, log } = await mountLocal({ info: {}, logs: { stdout: 'line' } })

    await ctx.docker.logs({ container: '--follow', tail: 5 })

    expect(recordedArgv(log).at(-1)).toBe('logs --tail 5 -- --follow')
  })

  it('applies the configured default tail when a request states none', async () => {
    const { ctx, log } = await mountLocal({ info: {}, logs: { stdout: '' } }, { defaultLogTail: 42 })

    await ctx.docker.logs({ container: 'web' })

    expect(recordedArgv(log).at(-1)).toBe('logs --tail 42 -- web')
  })

  it('interleaves container stdout and stderr into one text', async () => {
    const { ctx } = await mountLocal({ info: {}, logs: { stdout: 'out\n', stderr: 'err\n' } })

    await expect(ctx.docker.logs({ container: 'web' }))
      .resolves.toEqual({ container: 'web', content: 'out\nerr\n', truncated: false })
  })

  it('rejects a non-positive tail before reaching the CLI', async () => {
    const { ctx, log } = await mountLocal({ info: {} })

    await expect(ctx.docker.logs({ container: 'web', tail: 0 }))
      .rejects.toMatchObject({ code: 'DOCKER_INVALID_REQUEST' })

    expect(recordedArgv(log).some(argv => argv.startsWith('logs'))).toBe(false)
  })
})

describe('local docker provider compose', () => {
  it('starts a project detached and waiting, then reports its settled containers', async () => {
    const { ctx, log } = await mountLocal({ info: {}, compose: { stdout: 'Container lab-db Started' }, ps: { stdout: PS_JSON } })

    const result = await ctx.docker.composeUp({ file: 'lab/docker-compose.yml', project: 'lab', services: ['db'] })

    expect(recordedArgv(log)[1])
      .toBe('compose --file lab/docker-compose.yml --project-name lab up --detach --wait db')
    expect(result.project).toBe('lab')
    expect(result.containers.map(c => c.name)).toEqual(['lab-db'])
  })

  it('never forwards a service filter to down, which removes the whole project', async () => {
    const { ctx, log } = await mountLocal({ info: {}, compose: { stdout: 'Removed' }, ps: { stdout: '' } })

    await ctx.docker.composeDown({ file: 'lab/docker-compose.yml', project: 'lab', services: ['db'] })

    expect(recordedArgv(log)[1]).toBe('compose --file lab/docker-compose.yml --project-name lab down')
  })

  it('rejects an empty compose file path before reaching the CLI', async () => {
    const { ctx } = await mountLocal({ info: {} })

    await expect(ctx.docker.composeUp({ file: '' }))
      .rejects.toMatchObject({ code: 'DOCKER_INVALID_REQUEST' })
  })

  it('runs the CLI from the configured project root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-docker-root-'))
    const { ctx, log } = await mountLocal({ info: {}, ps: { stdout: '' } }, { projectRoot: root })

    await ctx.docker.list()

    // The stub appends `pwd` on every invocation, so the recorded value is the
    // working directory the subprocess seam actually used.
    expect(readFileSync(log, 'utf8').includes(root)).toBe(true)
  })
})
