import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import {
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
} from '../../../lib/constants'

export const SEGMENT_PATH_KEY = 'nextSegmentPath'

export type PrefetchSegmentDataRoute = {
  source: string
  destination: string
}

export function buildPrefetchSegmentDataRoute(
  page: string,
  segmentPath: string
): PrefetchSegmentDataRoute {
  const pagePath = normalizePagePath(page)

  const destination = path.posix.join(
    `${pagePath}${RSC_SEGMENTS_DIR_SUFFIX}`,
    `${segmentPath}${RSC_SEGMENT_SUFFIX}`
  )

  const { namedRegex } = getNamedRouteRegex(destination, {
    prefixRouteKeys: true,
    includePrefix: true,
    includeSuffix: true,
    excludeOptionalTrailingSlash: true,
    backreferenceDuplicateKeys: true,
  })

  return {
    destination,
    source: namedRegex,
  }
}
