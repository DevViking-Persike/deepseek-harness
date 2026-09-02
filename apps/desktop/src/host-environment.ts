/** Utilities for composing the supervised Harness Host environment. */

import { delimiter, dirname, join } from 'node:path'

/** Inputs used to compose the Harness Host command-search path. */
export interface HostPathOptions {
  /** User home directory that owns conventional tool installations. */
  homeDirectory: string
  /** Command-search path inherited by the Electron process. */
  inheritedPath: string | undefined
  /** Node executable selected for the source launcher. */
  nodeExecutable: string
  /** DeepSeek Harness source checkout root. */
  sourceRoot: string
}

/**
 * Composes a deterministic command-search path for a Host started by a GUI process.
 *
 * @param options - Source, runtime, user, and inherited path locations.
 * @returns A platform-delimited path that includes conventional developer tool directories.
 */
export function composeHostPath(options: HostPathOptions): string {
  const { homeDirectory, inheritedPath, nodeExecutable, sourceRoot } = options
  return [
    dirname(nodeExecutable),
    join(sourceRoot, 'node_modules', '.bin'),
    join(homeDirectory, '.local', 'bin'),
    join(homeDirectory, '.cargo', 'bin'),
    join(homeDirectory, 'go', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    inheritedPath ?? '/usr/bin:/bin:/usr/sbin:/sbin',
  ].join(delimiter)
}
