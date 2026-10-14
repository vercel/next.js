import type { Route } from '../../../shared/lib/route-types'
import type { PathnameNormalizer } from './pathname-normalizer'

import {
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
} from '../../../lib/constants'
import { escapeStringRegexp } from '../../../shared/lib/escape-regexp'

const PATTERN = new RegExp(
  `^(/.*)${escapeStringRegexp(RSC_SEGMENTS_DIR_SUFFIX)}(/.*)${escapeStringRegexp(RSC_SEGMENT_SUFFIX)}$`
)

export class SegmentPrefixRSCPathnameNormalizer implements PathnameNormalizer {
  public match(pathname: Route): boolean {
    return PATTERN.test(pathname)
  }

  public extract(pathname: Route) {
    const match = pathname.match(PATTERN)
    if (!match) return null

    return { originalPathname: match[1] as Route, segmentPath: match[2] }
  }

  public normalize(pathname: Route): Route {
    const match = this.extract(pathname)
    if (!match) return pathname

    return match.originalPathname
  }
}
