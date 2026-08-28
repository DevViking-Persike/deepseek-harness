/**
 * Image support: the one way another plugin says whether this session's
 * current model accepts image input.
 *
 * The composer cannot read the plugins that would know — the dependency runs
 * ui-model-selection → ui-conversation, never back — so the knower pushes
 * here and the attach path reads its own session's store. This mirrors
 * {@link ComposerBlocks} at a finer grain: a text-only model must refuse an
 * image, not stop the whole composer.
 *
 * Tri-state by design: `true` accepts, `false` refuses, `undefined` cannot
 * say — before the first directory load, or after one failed, when gating
 * would lock a working attach path behind an unreachable answer.
 *
 * Like blocks, this is an affordance, not enforcement: the Host refuses
 * image content a model cannot take regardless of what any client disables.
 */

import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId, SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** The registry face other plugins reach through `ctx.conversation.imageSupport`. */
export interface ImageSupport {
  /**
   * Publish this session's image capability. Idempotent: publishing the value
   * already stored notifies nobody.
   * @param sessionId - the session whose model capability changed.
   * @param value - `true` accepts, `false` refuses, `undefined` cannot say.
   */
  set(sessionId: SessionId, value: boolean | undefined): void
  /**
   * The store the attach path reads for one session. Created on first read
   * from either side, so the knower may publish before the session's composer
   * mounts and the composer still sees it.
   * @param sessionId - the session to observe.
   * @returns that session's capability store (undefined value = cannot say).
   */
  storeFor(sessionId: SessionId): SnapshotStore<boolean | undefined>
  /**
   * Drop one session's store. The session scope's disposer calls this; a
   * publisher never needs to.
   * @param sessionId - the session being torn down.
   */
  forget(sessionId: SessionId): void
}

/** The per-session image-capability registry (one instance per plugin fiber). */
export class ImageSupportRegistry implements ImageSupport {
  private readonly stores = new Map<SessionId, SnapshotStore<boolean | undefined>>()

  /** @inheritdoc */
  set(sessionId: SessionId, value: boolean | undefined): void {
    const store = this.storeFor(sessionId)
    if (store.getSnapshot() === value) return
    store.set(value)
  }

  /** @inheritdoc */
  storeFor(sessionId: SessionId): SnapshotStore<boolean | undefined> {
    const existing = this.stores.get(sessionId)
    if (existing !== undefined) return existing
    const created = createSnapshotStore<boolean | undefined>(undefined)
    this.stores.set(sessionId, created)
    return created
  }

  /** @inheritdoc */
  forget(sessionId: SessionId): void {
    this.stores.delete(sessionId)
  }
}
