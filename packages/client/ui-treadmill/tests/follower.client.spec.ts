import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { createFollower, type NextStep } from '../src/client/follower.ts'
import { STAGES } from '../src/client/stages.ts'

const SID = 'fk-1' as SessionId

function fakeSession() {
  const listeners = new Set<() => void>()
  let running = false
  return {
    face: {
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      getSnapshot: () => ({ running }),
    },
    set(next: boolean) { running = next; for (const listener of listeners) listener() },
  }
}

function step(cursorStage: string, stageId: string): NextStep {
  const stage = STAGES.find(candidate => candidate.id === stageId)
  if (stage === undefined) throw new Error(stageId)
  return { cursorStage, stage, prompt: `/${stage.skill} ${stageId}` }
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('createFollower', () => {
  it('submits the next automatic stage once the run ends and the cursor moved', async () => {
    const session = fakeSession()
    const submitted: string[] = []
    let next: NextStep | undefined = step('20', '20')
    const follower = createFollower({
      session: () => session.face,
      next: () => Promise.resolve(next),
      submit: (_id, prompt) => { submitted.push(prompt); return Promise.resolve() },
      warn: () => {},
    })
    follower.started(SID, '00s')
    session.set(true)
    session.set(false)
    await settle()
    expect(submitted).toEqual(['/desenvolvimento 20'])
    // The cursor did not move after that run: nothing more is submitted.
    session.set(true)
    session.set(false)
    await settle()
    expect(submitted).toEqual(['/desenvolvimento 20'])
    // It moved again: the follower continues.
    next = step('25', '25')
    session.set(true)
    session.set(false)
    await settle()
    expect(submitted).toEqual(['/desenvolvimento 20', '/review-codigo-subagents 25'])
    follower.dispose()
  })

  it('stops at a decision of undefined, while switched off, and reports a failure', async () => {
    const session = fakeSession()
    const submitted: string[] = []
    const warnings: string[] = []
    let next: NextStep | undefined = undefined
    const follower = createFollower({
      session: () => session.face,
      next: () => next === undefined ? Promise.resolve(undefined) : Promise.resolve(next),
      submit: (_id, prompt) => { submitted.push(prompt); return prompt.includes('fail') ? Promise.reject(new Error('queue closed')) : Promise.resolve() },
      warn: (message) => { warnings.push(message) },
    })
    follower.started(SID, '00s')
    session.set(true); session.set(false); await settle()
    expect(submitted).toEqual([])
    next = step('20', '20')
    follower.setEnabled(SID, false)
    expect(follower.enabled(SID)).toBe(false)
    session.set(true); session.set(false); await settle()
    expect(submitted).toEqual([])
    follower.setEnabled(SID, true)
    next = { ...step('20', '20'), prompt: 'fail' }
    session.set(true); session.set(false); await settle()
    expect(warnings).toEqual(['follow-through stopped for fk-1: queue closed'])
    follower.dispose()
  })

  it('ignores a session the runtime does not know and re-arms an existing watch', async () => {
    const session = fakeSession()
    const submitted: string[] = []
    const follower = createFollower({
      session: id => id === SID ? session.face : undefined,
      next: () => Promise.resolve(step('20', '20')),
      submit: (_id, prompt) => { submitted.push(prompt); return Promise.resolve() },
      warn: () => {},
    })
    follower.started('unknown' as SessionId, '00s')
    follower.started(SID, '00s')
    follower.started(SID, '20')
    session.set(true); session.set(false); await settle()
    // The watch now records stage 20 as started, so a cursor still at 20 is not re-run.
    expect(submitted).toEqual([])
    follower.dispose()
  })
})
