/**
 * Follow-through engine: watches sessions the Treadmill started a stage in and
 * submits the next stage when the run ends, the cursor moved, and the next
 * stage's gate is automatic. Pure over injected session access, so it is
 * testable without the runtime.
 */
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { StageSpec } from './stages.ts'

/** The subset of a session the follower needs. */
export interface FollowedSession {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => { running: boolean }
}

/** What the next automatic step would be, or `undefined` to stop. */
export interface NextStep {
  /** The cursor stage at decision time, compared with the stage last started to detect movement. */
  readonly cursorStage: string | undefined
  readonly stage: StageSpec
  readonly prompt: string
}

/** Dependencies of the follower. */
export interface FollowerDeps {
  session: (id: SessionId) => FollowedSession | undefined
  next: (id: SessionId) => Promise<NextStep | undefined>
  submit: (id: SessionId, prompt: string) => Promise<void>
  warn: (message: string) => void
}

/** The follower's public face. */
export interface Follower {
  /** Whether follow-through is on for a session (on by default). */
  enabled: (id: SessionId) => boolean
  setEnabled: (id: SessionId, enabled: boolean) => void
  /** Record that a stage run was submitted, arming the watcher for its end. */
  started: (id: SessionId, stageId: string) => void
  dispose: () => void
}

interface Watch {
  unsubscribe: () => void
  /** The cursor stage whose run was submitted last; the cursor must leave it before the next auto step. */
  startedAt: string
  running: boolean
  deciding: boolean
}

/**
 * Create the follow-through engine.
 * @param deps - session access, decision, submission, and logging.
 * @returns the follower.
 */
export function createFollower(deps: FollowerDeps): Follower {
  const disabled = new Set<SessionId>()
  const watches = new Map<SessionId, Watch>()

  const decide = async (id: SessionId, watch: Watch): Promise<void> => {
    if (watch.deciding || disabled.has(id)) return
    watch.deciding = true
    try {
      const step = await deps.next(id)
      if (step === undefined || step.cursorStage === undefined || step.cursorStage === watch.startedAt) return
      await deps.submit(id, step.prompt)
      watch.startedAt = step.cursorStage
    } catch (error: unknown) {
      deps.warn(`follow-through stopped for ${id}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      watch.deciding = false
    }
  }

  const arm = (id: SessionId, stageId: string): void => {
    const existing = watches.get(id)
    if (existing !== undefined) {
      existing.startedAt = stageId
      existing.running = true
      return
    }
    const session = deps.session(id)
    if (session === undefined) return
    const watch: Watch = { unsubscribe: () => {}, startedAt: stageId, running: true, deciding: false }
    watch.unsubscribe = session.subscribe(() => {
      const running = session.getSnapshot().running
      if (watch.running && !running) void decide(id, watch)
      watch.running = running
    })
    watches.set(id, watch)
  }

  return {
    enabled: id => !disabled.has(id),
    setEnabled: (id, enabled) => {
      if (enabled) disabled.delete(id)
      else disabled.add(id)
    },
    started: arm,
    dispose: () => {
      for (const watch of watches.values()) watch.unsubscribe()
      watches.clear()
    },
  }
}
