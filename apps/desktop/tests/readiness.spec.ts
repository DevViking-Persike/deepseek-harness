import { describe, expect, it } from 'vitest'
import { parseReadyUrl } from '../src/readiness.ts'


describe('parseReadyUrl', () => {
  it('reads the settled Web profile URL', () => {
    expect(parseReadyUrl('dsh web: http://127.0.0.1:43123/')?.href).toBe('http://127.0.0.1:43123/')
  })

  it('ignores the optional LAN annotation', () => {
    expect(parseReadyUrl('dsh web: http://localhost:1234/ (LAN: http://10.0.0.2:1234)')?.href).toBe('http://localhost:1234/')
  })

  it.each(['noise', 'dsh web: https://example.com/', 'dsh web: http://10.0.0.2:3000/', 'dsh web: invalid'])(
    'rejects untrusted readiness output: %s',
    line => expect(parseReadyUrl(line)).toBeUndefined(),
  )
})
