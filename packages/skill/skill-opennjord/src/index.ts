/**
 * Bundled OpenNjord Esteira installation.
 *
 * The package vendors the complete `.opennjord` installation (skills, rules,
 * commands, agents, integrations, and tools) under `assets/opennjord` and
 * serves its `skills` directory to every project through one filesystem
 * Skill provider. A project therefore needs no `.opennjord`, `.claude`, or
 * `.codex` copy: the harness owns the method, and the project owns only its
 * `.spec/` cursor and artifacts and its `docs/` ADRs.
 *
 * @module @deepseek-ai/dsh-skill-opennjord
 */

import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'

/** Provider name under which the bundled skills register. */
export const PROVIDER_NAME = 'opennjord'
/** Absolute path of the vendored `.opennjord` installation. */
export const OPENNJORD_ROOT = fileURLToPath(new URL('../assets/opennjord/', import.meta.url))
/** Absolute path of the vendored skills directory served to every project. */
export const OPENNJORD_SKILLS_DIR = fileURLToPath(new URL('../assets/opennjord/skills/', import.meta.url))

/** Cordis plugin name. */
export const name = 'skill-opennjord'
/** Service required by the bundled provider. */
export const inject = ['skills']

/**
 * Register the bundled OpenNjord skills on `ctx.skills`. The provider scans
 * only the vendored directory: project and user roots stay with the ordinary
 * filesystem provider, so a project copy of a skill still outranks this one.
 * @param ctx - Cordis context carrying the skill registry.
 */
export function apply(ctx: Context): void {
  let provider: FileSystemSkillProvider | undefined
  ctx.skills.registerProvider((control) => {
    provider = new FileSystemSkillProvider(ctx, control, {
      providerName: PROVIDER_NAME,
      includeDefaultRoots: false,
      customSkillDirs: [OPENNJORD_SKILLS_DIR],
      watch: false,
    })
    return provider
  })
  ctx.effect(function* () {
    yield async () => { await provider?.dispose() }
  }, 'skill-opennjord provider')
}
