export type NavigationDecision = 'allow' | 'external' | 'deny'

/**
 * Classifies renderer navigation relative to the Host URL.
 *
 * @param target - Requested renderer URL.
 * @param hostOrigin - Origin printed by the supervised Host.
 * @returns Whether Electron may navigate, should open externally, or must deny.
 */
export function classifyNavigation(target: string, hostOrigin: string): NavigationDecision {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return 'deny'
  }
  if (url.origin === hostOrigin) return 'allow'
  if (url.protocol === 'https:') return 'external'
  return 'deny'
}
