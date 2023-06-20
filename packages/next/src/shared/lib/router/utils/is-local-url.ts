import { isAbsoluteUrl, getLocationOrigin } from '../../utils'
import { hasBasePath } from '../../../../client/has-base-path'

/**
 * Detects whether a given url is routable by the Next.js router (browser only).
 */
export function isLocalURL(url: string): boolean {
  // prevent a hydration mismatch on href for url with anchor refs
  if (!isAbsoluteUrl(url)) return true
  try {
    // absolute urls can be local if they are on the same origin
    const locationOrigin = getLocationOrigin()
    const resolved = new URL(url, locationOrigin)
    return resolved.origin === locationOrigin && hasBasePath(resolved.pathname)
  } catch (_) {
    return false
  }
}
