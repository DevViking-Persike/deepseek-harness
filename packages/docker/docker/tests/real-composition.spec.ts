/**
 * Real-composition test: boot a test-only `cordis.yml` through the actual
 * Loader and app boot, and assert what a deployment observes — the seam
 * mounts, the provider row registers itself on it, and a composition missing
 * the provider still answers rather than failing to load.
 *
 * The boot runs in a subprocess because the Loader resolves plugin rows
 * through Node's real module pipeline, while the test runner resolves
 * workspace names through the tsconfig paths map. Only a separate process
 * exercises the resolution a deployment actually performs.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { execa } from 'execa'

/** This package's own directory: its node_modules links every workspace name. */
const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** What the subprocess reports about the booted tree. */
interface Probe {
  mounted: boolean
  providers: string[]
  engineStatusKind?: string
  listError?: string
}

/**
 * Boot one composition in a subprocess and report what the tree exposes.
 *
 * @param rows - the `cordis.yml` body under test.
 * @returns the observed registry state.
 */
async function bootProbe(rows: string): Promise<Probe> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-docker-comp-'))
  const configPath = join(dir, 'cordis.yml')
  writeFileSync(configPath, rows)
  const probePath = join(dir, 'probe.mts')
  writeFileSync(probePath, [
    "import { boot } from '@deepseek-ai/dsh-app-boot'",
    `const ctx = await boot('docker-composition-probe', ${JSON.stringify(configPath)}, undefined, undefined, ${JSON.stringify(PKG_ROOT)})`,
    "const docker = ctx.get('docker')",
    'const out: Record<string, unknown> = { mounted: docker !== undefined, providers: docker?.providerIds() ?? [] }',
    'if (docker !== undefined) {',
    '  try {',
    '    const status = await docker.engineStatus(new AbortController().signal)',
    '    out.engineStatusKind = typeof status.running',
    '  } catch (error) {',
    "    out.engineStatusKind = 'threw:' + String(error).slice(0, 60)",
    '  }',
    '  try {',
    '    await docker.list({}, new AbortController().signal)',
    '  } catch (error) {',
    '    out.listError = String(error).slice(0, 90)',
    '  }',
    '}',
    "console.log('PROBE:' + JSON.stringify(out))",
    'await ctx.fiber.dispose()',
    'process.exit(0)',
    '',
  ].join('\n'))
  const { stdout } = await execa('pnpm', ['exec', 'tsx', probePath], {
    cwd: REPO_ROOT,
    timeout: 120_000,
  })
  const line = stdout.split('\n').find(entry => entry.startsWith('PROBE:'))
  if (line === undefined) throw new Error(`probe produced no result:\n${stdout}`)
  return JSON.parse(line.slice('PROBE:'.length)) as Probe
}

// The local provider drives the Docker CLI, so a composition that mounts it
// must also supply the subprocess seam it injects — exactly as a deployment's
// own bundle does.
const SEAM_AND_PROVIDER = `- id: subprocess-local
  name: '@deepseek-ai/dsh-subprocess-local'
- id: docker
  name: '@deepseek-ai/dsh-docker'
- id: docker-local
  name: '@deepseek-ai/dsh-docker-local'
`

describe('docker composition', () => {
  it('boots the seam with its local provider registered on it', async () => {
    const probe = await bootProbe(SEAM_AND_PROVIDER)

    expect(probe.mounted).toBe(true)
    // Registration is what the composition buys: the row put itself on the
    // seam under the provider's own id, which the package names, not the row.
    expect(probe.providers).toContain('local')
  }, 180_000)

  it('answers an engine status instead of throwing, whatever the machine runs', async () => {
    const probe = await bootProbe(SEAM_AND_PROVIDER)

    // A daemon may or may not be up here; either way the composition answers,
    // because an unreachable engine is a state the UI renders.
    expect(probe.engineStatusKind).toBe('boolean')
  }, 180_000)

  it('mounts the seam alone and reports unavailability rather than failing to load', async () => {
    const probe = await bootProbe(`- id: docker
  name: '@deepseek-ai/dsh-docker'
`)

    expect(probe.mounted).toBe(true)
    expect(probe.providers).toEqual([])
    // Selection has nothing to pick, and asking is an answer, not a crash.
    expect(probe.listError).toMatch(/provider|unavailable/i)
  }, 180_000)
})
