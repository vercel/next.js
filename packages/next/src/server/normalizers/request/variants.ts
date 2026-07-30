import type { PathnameNormalizer } from './pathname-normalizer'

import { VARIANTS_PATH_PREFIX } from '../../../lib/constants'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'

/**
 * Matches an internal variant pathname and captures the packed values segment
 * plus the remaining route pathname, e.g. for
 * `/__variants/theme@variants.ts=dark/blog/my-post` the captures are
 * `theme@variants.ts=dark` and `/blog/my-post`.
 *
 * The values segment is a single path segment so that this normalizer stays
 * route-agnostic: it runs before route resolution and therefore cannot know how
 * many segments belong to the route.
 */
const PATTERN = new RegExp(
  `^/${escapeStringRegexp(VARIANTS_PATH_PREFIX)}/([^/]+)(/.*)?$`
)

export interface ExtractedVariants {
  /**
   * The pathname with the variants prefix removed.
   */
  originalPathname: string
  /**
   * Resolved variant values, keyed by variant identity.
   */
  variants: Record<string, string>
}

/**
 * Strips the variants prefix that the proxy adds to encode resolved variant
 * values, and recovers those values.
 *
 * Variant values are restricted to a charset that excludes `/`, `&`, `=`, and
 * `%`, so the packed segment never needs percent-encoding. That keeps it immune
 * to path normalization elsewhere in the stack decoding a `%2F` and splitting
 * the segment.
 */
export class VariantsPathnameNormalizer implements PathnameNormalizer {
  public match(pathname: string): boolean {
    return PATTERN.test(pathname)
  }

  public extract(pathname: string): ExtractedVariants | null {
    const match = pathname.match(PATTERN)
    if (!match) return null

    const variants: Record<string, string> = {}
    for (const [key, value] of new URLSearchParams(match[1])) {
      variants[key] = value
    }

    return {
      // A route at the root has no remaining pathname.
      originalPathname: match[2] ?? '/',
      variants,
    }
  }

  public normalize(pathname: string): string {
    const extracted = this.extract(pathname)
    if (!extracted) return pathname

    return extracted.originalPathname
  }
}
