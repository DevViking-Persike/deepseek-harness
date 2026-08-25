import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as RepositoryLocalInvariant from '../src/invariant.ts'

describe('repository-local invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(RepositoryLocalInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-repository-local', () => {})
    }).toThrow(/already registered/)
  })
})
