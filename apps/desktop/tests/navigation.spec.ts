import { describe, expect, it } from 'vitest'
import { classifyNavigation } from '../src/navigation.ts'

describe('classifyNavigation', () => {
  const origin = 'http://127.0.0.1:3000'

  it('allows only the supervised Host origin in the renderer', () => {
    expect(classifyNavigation('http://127.0.0.1:3000/session/1', origin)).toBe('allow')
  })

  it('sends external HTTPS URLs to the operating system', () => {
    expect(classifyNavigation('https://docs.example.com/', origin)).toBe('external')
  })

  it.each(['http://example.com/', 'file:///tmp/x', 'javascript:alert(1)', 'not a url'])(
    'denies unsafe navigation: %s',
    url => expect(classifyNavigation(url, origin)).toBe('deny'),
  )
})
