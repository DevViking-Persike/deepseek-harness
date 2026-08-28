/** Image-support registry behavior: tri-state push, idempotence, teardown. */

import { describe, expect, it } from 'vitest'
import { ImageSupportRegistry } from '../src/client/input/image-support.ts'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

const SESSION = 'session-image-support' as SessionId

describe('ImageSupportRegistry', () => {
  it('starts as cannot-say and publishes each transition exactly once', () => {
    const registry = new ImageSupportRegistry()
    const seen: Array<boolean | undefined> = []
    const store = registry.storeFor(SESSION)
    seen.push(store.getSnapshot())
    const stop = store.subscribe(() => { seen.push(store.getSnapshot()) })

    registry.set(SESSION, true)
    registry.set(SESSION, true) // idempotent: no notification
    registry.set(SESSION, false)
    registry.set(SESSION, undefined)

    stop()
    expect(seen).toEqual([undefined, true, false, undefined])
  })

  it('creates the store on first read from the publisher side', () => {
    const registry = new ImageSupportRegistry()
    registry.set(SESSION, false)

    expect(registry.storeFor(SESSION).getSnapshot()).toBe(false)
  })

  it('drops the store on forget', () => {
    const registry = new ImageSupportRegistry()
    registry.set(SESSION, true)
    registry.forget(SESSION)

    // A fresh store starts over at cannot-say.
    expect(registry.storeFor(SESSION).getSnapshot()).toBeUndefined()
  })
})
