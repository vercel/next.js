import path from '../../../shared/lib/isomorphic/path'
import type { Route } from '../../../shared/lib/route-types'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import {
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
} from '../../../lib/constants'

export const SEGMENT_PATH_KEY = 'nextSegmentPath'

export type PrefetchSegmentDataRoute = {
  source: string
  // A rewrite destination template, subsequently interpolated by build/index,
  // not the final normalized URL pathname.
  destination: string
  routeKeys: { [key: string]: string }
}

export function buildPrefetchSegmentDataRoute(
  page: Route,
  segmentPath: string
): PrefetchSegmentDataRoute {
  // @ts-ignore -- Human review: build/index passes an App URL Route to the raw Page file encoder to name its RSC segment artifacts. Preserve this transport-filename normalization assumption.
  const pagePath = normalizePagePath(page)

  // At this point this is the initial HTTP transport pathname pattern. The
  // returned destination is later changed into a $segment rewrite template.
  const destination = path.posix.join(
    `${pagePath}${RSC_SEGMENTS_DIR_SUFFIX}`,
    `${segmentPath}${RSC_SEGMENT_SUFFIX}`
  ) as Route

  const { namedRegex, routeKeys } = getNamedRouteRegex(destination, {
    prefixRouteKeys: true,
    includePrefix: true,
    includeSuffix: true,
    excludeOptionalTrailingSlash: true,
    backreferenceDuplicateKeys: true,
  })

  return {
    destination,
    source: namedRegex,
    routeKeys,
  }
}
