import path from '../../../shared/lib/isomorphic/path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { getNamedRouteRegex } from '../../../shared/lib/router/utils/route-regex'
import {
  RSC_PREFETCH_SUFFIX,
  RSC_SEGMENT_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
} from '../../../lib/constants'

export const SEGMENT_PATH_KEY = 'nextSegmentPath'

export type PrefetchSegmentDataRoute = {
  source: string
  destination: string
  routeKeys: { [key: string]: string }
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

/**
 * Builds a prefetch segment data route that is inverted. This means that it's
 * supposed to rewrite from the previous segment paths route back to the
 * prefetch RSC route.
 *
 * @param page - The page to build the route for.
 * @param segmentPath - The segment path to build the route for.
 * @returns The prefetch segment data route.
 */
export function buildInversePrefetchSegmentDataRoute(
  page: string,
  segmentPath: string
): PrefetchSegmentDataRoute {
  const pagePath = normalizePagePath(page)

  const source = path.posix.join(
    `${pagePath}${RSC_SEGMENTS_DIR_SUFFIX}`,
    `${segmentPath}${RSC_SEGMENT_SUFFIX}`
  )

  const { namedRegex, routeKeys } = getNamedRouteRegex(source, {
    prefixRouteKeys: true,
    includePrefix: true,
    includeSuffix: true,
    excludeOptionalTrailingSlash: true,
    backreferenceDuplicateKeys: true,
  })

  const destination = path.posix.join(`${pagePath}${RSC_PREFETCH_SUFFIX}`)

  return {
    source: namedRegex,
    destination,
    routeKeys,
  }
}
