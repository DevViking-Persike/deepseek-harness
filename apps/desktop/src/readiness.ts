/** The readiness prefix emitted after the Web profile has settled. */
const READY_PREFIX = 'dsh web: '

/**
 * Extracts the loopback Web profile URL from one stdout line.
 *
 * @param line - One complete child-process output line.
 * @returns The validated HTTP URL, or undefined for unrelated output.
 */
export function parseReadyUrl(line: string): URL | undefined {
  const start = line.indexOf(READY_PREFIX)
  if (start < 0) return undefined
  const candidate = line.slice(start + READY_PREFIX.length).trim().split(/\s+\(LAN:/u, 1)[0]
  if (candidate === undefined) return undefined
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) return undefined
  return url
}
