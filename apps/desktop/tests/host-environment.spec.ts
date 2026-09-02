import { delimiter } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeHostPath } from '../src/host-environment.ts'

describe('composeHostPath', () => {
  it('makes conventional developer tools visible to a GUI-launched Host', () => {
    expect(composeHostPath({
      homeDirectory: '/Users/example',
      inheritedPath: '/usr/bin:/bin',
      nodeExecutable: '/Users/example/.nvm/versions/node/v24/bin/node',
      sourceRoot: '/Volumes/Dev/deepseek-harness',
    }).split(delimiter)).toEqual([
      '/Users/example/.nvm/versions/node/v24/bin',
      '/Volumes/Dev/deepseek-harness/node_modules/.bin',
      '/Users/example/.local/bin',
      '/Users/example/.cargo/bin',
      '/Users/example/go/bin',
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ])
  })

  it('retains the operating-system command path when Electron inherits none', () => {
    expect(composeHostPath({
      homeDirectory: '/Users/example',
      inheritedPath: undefined,
      nodeExecutable: '/opt/node/bin/node',
      sourceRoot: '/workspace',
    })).toContain(`${delimiter}/usr/bin:/bin:/usr/sbin:/sbin`)
  })
})
