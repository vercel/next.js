import type { PathnameNormalizer } from './pathname-normalizer'

import {
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
} from '../../../lib/constants'

const PATTERN = new RegExp(
  `^(/.*)${RSC_SEGMENTS_DIR_SUFFIX}(/.*)${RSC_SEGMENT_SUFFIX}$`
)

export class SegmentPrefixRSCPathnameNormalizer implements PathnameNormalizer {
  public match(pathname: string): boolean {
    return PATTERN.test(pathname)
  }

  public extract(pathname: string) {
    const match = pathname.match(PATTERN)
    if (!match) return null

    return { originalPathname: match[1], segmentPath: match[2] }
  }

  public normalize(pathname: string): string {
    const match = this.extract(pathname)
    if (!match) return pathname

    return match.originalPathname
  }
}
