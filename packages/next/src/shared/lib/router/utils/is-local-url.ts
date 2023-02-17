import { getLocationOrigin, getLinkType } from '../../utils'
import { hasBasePath } from '../../../../client/has-base-path'
import { LinkType } from '../router'

/**
 * Detects whether a given url is routable by the Next.js router (browser only).
 */
export function isLocalURL(
  url: string,
  linkType: LinkType = getLinkType(url)
): boolean {
  // prevent a hydration mismatch on href for url with anchor refs
  if (linkType !== LinkType.Absolute && linkType !== LinkType.SchemeRelative) {
    return true
  }

  try {
    // absolute and scheme-relative urls can be local if they are on the same origin
    const locationOrigin = getLocationOrigin()
    const resolved = new URL(url, locationOrigin)
    return resolved.origin === locationOrigin && hasBasePath(resolved.pathname)
  } catch (_) {
    return false
  }
}
