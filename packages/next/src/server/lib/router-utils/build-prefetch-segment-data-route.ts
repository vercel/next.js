import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import {
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
} from '../../../lib/constants'
import type { ManifestPrefetchSegmentDataRoute } from '../../../build'

export const SEGMENT_PATH_KEY = 'nextSegmentPath'

export function buildPrefetchSegmentDataRoute(
  page: string
): ManifestPrefetchSegmentDataRoute {
  const pagePath = normalizePagePath(page)
  const route = path.posix.join(
    `${pagePath}${RSC_SEGMENTS_DIR_SUFFIX}`,
    `[...${SEGMENT_PATH_KEY}]${RSC_SEGMENT_SUFFIX}`
  )

  const { routeKeys, namedRegex } = getNamedRouteRegex(route, {
    prefixRouteKeys: true,
    includeExtraParts: true,
    excludeOptionalTrailingSlash: true,
  })

  return {
    page,
    route,
    routeKeys,
    namedRegex,
  }
}
