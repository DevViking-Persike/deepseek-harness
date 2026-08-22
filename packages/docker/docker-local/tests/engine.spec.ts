import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import DockerRuntime from '@deepseek-ai/dsh-docker'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import * as dockerLocal from '@deepseek-ai/dsh-docker-local'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-docker-engine-spec-'))

/**
 * Write an executable stub that exits with `code`, echoes `text`, and appends
 * its argv to a shared log. Engine management shells out to programs the
 * harness does not own, so the tests drive real executables.
 */
function stub(dir: string, name: string, code: number, text: string, log: string): string {
  const path = join(dir, name)
  writeFileSync(path, [
    '#!/bin/sh',
    `printf '%s\\n' "${name} $*" >> '${log}'`,
    `printf '%s' '${text}'`,
    `exit ${String(code)}`,
  ].join('\n') + '\n')
  chmodSync(path, 0o755)
  return path
}

/** Every argv line the stubs recorded, oldest first. */
function recorded(log: string): string[] {
  try {
    return readFileSync(log, 'utf8').split('\n').filter(line => line.length > 0)
  } catch {
    // No stub ran, so none created the log.
    return []
  }
}

/**
 * Mount the seam over a stub `docker` (and optionally a stub VM manager and
 * installer) with an explicit platform-shaped config.
 */
async function mount(opts: {
  dockerInfoExit: number
  vm?: { exit: number; text?: string }
  installer?: { exit: number }
  config?: Partial<dockerLocal.Config>
}): Promise<{ ctx: Context; log: string; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-docker-engine-bin-'))
  const log = join(dir, 'argv.log')
  const cli = stub(dir, 'docker', opts.dockerInfoExit, '27.0.1', log)
  const vmCli = opts.vm === undefined ? join(dir, 'absent-vm') : stub(dir, 'colima', opts.vm.exit, opts.vm.text ?? '', log)
  const installer = opts.installer === undefined
    ? join(dir, 'absent-installer')
    : stub(dir, 'brew', opts.installer.exit, 'installed', log)
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  ;(ctx.subprocess as LocalSubprocessRuntime).internals = { spillDir }
  await ctx.plugin(DockerRuntime, {})
  await ctx.plugin(dockerLocal, {
    cli,
    projectRoot: tmpdir(),
    engineVmCli: vmCli,
    engineMacInstaller: installer,
    ...opts.config,
  })
  return { ctx, log, dir }
}

describe('engine status', () => {
  it('reports a reachable engine as running and offers nothing', async () => {
    const { ctx } = await mount({ dockerInfoExit: 0, vm: { exit: 0 } })

    await expect(ctx.docker.engineStatus()).resolves.toMatchObject({
      running: true,
      startable: false,
      installable: false,
    })
  })

  it('offers a start when the runtime is installed but its engine is silent', async () => {
    const { ctx } = await mount({ dockerInfoExit: 1, vm: { exit: 0 } })

    const status = await ctx.docker.engineStatus()

    expect(status).toMatchObject({ running: false, startable: true, installable: false })
    expect(status.detail).toMatch(/installed but its engine is not answering/)
  })

  it('offers an install when no runtime is present and the deployment allows it', async () => {
    const { ctx } = await mount({ dockerInfoExit: 1, config: { allowEngineInstall: true } })

    const status = await ctx.docker.engineStatus()

    expect(status).toMatchObject({ running: false, startable: false, installable: true })
    expect(status.detail).toMatch(/not installed on this machine/)
  })

  it('offers no install when the deployment withholds that permission', async () => {
    const { ctx } = await mount({ dockerInfoExit: 1 })

    await expect(ctx.docker.engineStatus()).resolves.toMatchObject({ installable: false })
  })

  it('offers no start when the deployment withholds that permission', async () => {
    const { ctx } = await mount({ dockerInfoExit: 1, vm: { exit: 0 }, config: { allowEngineStart: false } })

    await expect(ctx.docker.engineStatus()).resolves.toMatchObject({ startable: false })
  })
})

describe('engine start', () => {
  it('starts the VM manager on macOS and reports the settled status', async () => {
    const { ctx, log } = await mount({ dockerInfoExit: 1, vm: { exit: 0, text: 'starting' } })

    const result = await ctx.docker.startEngine()

    expect(recorded(log).some(line => line.startsWith('colima start'))).toBe(true)
    expect(result.status.running).toBe(false)
    expect(result.output).toContain('starting')
  })

  it('refuses to start when the deployment withholds that permission', async () => {
    const { ctx } = await mount({ dockerInfoExit: 1, vm: { exit: 0 }, config: { allowEngineStart: false } })

    await expect(ctx.docker.startEngine()).rejects.toMatchObject({ code: 'DOCKER_ENGINE_UNMANAGEABLE' })
  })
})

describe('engine install', () => {
  it('installs both the client CLI and the VM manager on macOS', async () => {
    const { ctx, log } = await mount({
      dockerInfoExit: 1,
      installer: { exit: 0 },
      config: { allowEngineInstall: true },
    })

    await ctx.docker.installEngine()

    const installs = recorded(log).filter(line => line.startsWith('brew install'))
    expect(installs).toHaveLength(2)
  })

  it('refuses to install when the deployment withholds that permission', async () => {
    const { ctx } = await mount({ dockerInfoExit: 1, installer: { exit: 0 } })

    await expect(ctx.docker.installEngine()).rejects.toMatchObject({ code: 'DOCKER_ENGINE_UNMANAGEABLE' })
  })
})

describe('seam without an engine-managing backend', () => {
  it('answers a status with no capability rather than failing', async () => {
    const ctx = new Context()
    await ctx.plugin(DockerRuntime, {})

    await expect(ctx.docker.engineStatus()).resolves.toEqual({
      running: false,
      startable: false,
      installable: false,
      detail: 'no registered docker provider can manage a local engine',
    })
  })

  it('refuses a start it cannot perform', async () => {
    const ctx = new Context()
    await ctx.plugin(DockerRuntime, {})

    await expect(ctx.docker.startEngine()).rejects.toMatchObject({ code: 'DOCKER_ENGINE_UNMANAGEABLE' })
    await expect(ctx.docker.installEngine()).rejects.toMatchObject({ code: 'DOCKER_ENGINE_UNMANAGEABLE' })
  })
})
