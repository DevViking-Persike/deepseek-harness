/**
 * Image-capability derivation: the catalog's per-model modalities decide what
 * the composer is told, with the same tri-state rule as routability.
 */

import { describe, expect, it } from 'vitest'
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelDirectoryState } from '../src/client/directory.ts'

// The derivation lives inside the service module; re-deriving it here would
// test a copy. Import through the module's export surface instead.
// eslint-disable-next-line import/no-relative-packages
import { imageSupportOf } from '../src/client/service.ts'

const groups = (models: Array<{ id: string; inputModalities?: string[] }>): ModelProviderGroup[] => [
  { id: 'prov', name: 'Prov', models: models.map(model => ({ name: model.id, ...model })) },
]

const state = (over: Partial<ModelDirectoryState>): ModelDirectoryState => ({
  current: null,
  routable: null,
  groups: [],
  failures: [],
  status: 'ready',
  error: null,
  ...over,
})

describe('imageSupportOf', () => {
  it('cannot say before the first load reports a selection', () => {
    expect(imageSupportOf(state({ current: null }))).toBeUndefined()
  })

  it('cannot say when the current model is absent from the advisory groups', () => {
    // Advisory membership: a route may serve a model it stopped advertising.
    const snapshot = state({
      current: { provider: 'prov', model: 'unlisted' },
      groups: groups([{ id: 'listed', inputModalities: ['text'] }]),
    })

    expect(imageSupportOf(snapshot)).toBeUndefined()
  })

  it('cannot say when the entry declares no modalities', () => {
    const snapshot = state({
      current: { provider: 'prov', model: 'mystery' },
      groups: groups([{ id: 'mystery' }]),
    })

    expect(imageSupportOf(snapshot)).toBeUndefined()
  })

  it('refuses only a declared modality list without image', () => {
    const snapshot = state({
      current: { provider: 'prov', model: 'text-only' },
      groups: groups([{ id: 'text-only', inputModalities: ['text'] }]),
    })

    expect(imageSupportOf(snapshot)).toBe(false)
  })

  it('accepts a declared modality list containing image', () => {
    const snapshot = state({
      current: { provider: 'prov', model: 'vision' },
      groups: groups([{ id: 'vision', inputModalities: ['text', 'image'] }]),
    })

    expect(imageSupportOf(snapshot)).toBe(true)
  })

  it('reads the current provider and model together, not loosely', () => {
    // Same model id under a different provider must not answer for it.
    const snapshot = state({
      current: { provider: 'other', model: 'vision' },
      groups: groups([{ id: 'vision', inputModalities: ['text', 'image'] }]),
    })

    expect(imageSupportOf(snapshot)).toBeUndefined()
  })
})
