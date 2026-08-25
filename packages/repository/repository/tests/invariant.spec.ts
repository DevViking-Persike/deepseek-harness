import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as RepositoryInvariant from '../src/invariant.ts'

describe('repository invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(RepositoryInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-repository', () => {})
    }).toThrow(/already registered/)
  })
})
