import { isMetadataRoute } from './is-metadata-route'
import path from '../../shared/lib/isomorphic/path'
import { interpolateDynamicPath } from '../../server/server-utils'
import { getNamedRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { djb2Hash } from '../../shared/lib/hash'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import {
  isGroupSegment,
  isParallelRouteSegment,
} from '../../shared/lib/segment'

/*
 * If there's special convention like (...) or @ in the page path,
 * Give it a unique hash suffix to avoid conflicts
 *
 * e.g.
 * /opengraph-image -> /opengraph-image
 * /(post)/opengraph-image.tsx -> /opengraph-image-[0-9a-z]{6}
 *
 * Sitemap is an exception, it should not have a suffix.
 * Each sitemap contains all the urls of sub routes, we don't have the case of duplicates `/(group)/sitemap.[ext]` and `/sitemap.[ext]` since they should be the same.
 * Hence we always normalize the urls for sitemap and do not append hash suffix, and ensure user-land only contains one sitemap per pathname.
 *
 * /sitemap -> /sitemap
 * /(post)/sitemap -> /sitemap
 */
function getMetadataRouteSuffix(page: string) {
  // Remove the last segment and get the parent pathname
  // e.g. /parent/a/b/c -> /parent/a/b
  // e.g. /parent/opengraph-image -> /parent
  const parentPathname = path.dirname(page)
  // Only apply suffix to metadata routes except for sitemaps
  if (page.endsWith('/sitemap')) {
    return ''
  }

  // Calculate the hash suffix based on the parent path
  let suffix = ''
  // Check if there's any special characters in the parent pathname.
  const segments = parentPathname.split('/')
  if (
    segments.some((seg) => isGroupSegment(seg) || isParallelRouteSegment(seg))
  ) {
    // Hash the parent path to get a unique suffix
    suffix = djb2Hash(parentPathname).toString(36).slice(0, 6)
  }
  return suffix
}

/**
 * Fill the dynamic segment in the metadata route
 *
 * Example:
 * fillMetadataSegment('/a/[slug]', { params: { slug: 'b' } }, 'open-graph') -> '/a/b/open-graph'
 *
 */
export function fillMetadataSegment(
  segment: string,
  params: any,
  lastSegment: string
) {
  const pathname = normalizeAppPath(segment)
  const routeRegex = getNamedRouteRegex(pathname, {
    prefixRouteKeys: false,
  })
  const route = interpolateDynamicPath(pathname, params, routeRegex)
  const { name, ext } = path.parse(lastSegment)
  const pagePath = path.posix.join(segment, name)
  const suffix = getMetadataRouteSuffix(pagePath)
  const routeSuffix = suffix ? `-${suffix}` : ''

  return normalizePathSep(path.join(route, `${name}${routeSuffix}${ext}`))
}

/**
 * Map metadata page key to the corresponding route
 *
 * static file page key:    /app/robots.txt -> /robots.xml -> /robots.txt/route
 * dynamic route page key:  /app/robots.tsx -> /robots -> /robots.txt/route
 *
 * @param page
 * @returns
 */
export function normalizeMetadataRoute(page: string) {
  if (!isMetadataRoute(page)) {
    return page
  }
  let route = page
  let suffix = ''
  if (page === '/robots') {
    route += '.txt'
  } else if (page === '/manifest') {
    route += '.webmanifest'
  } else {
    suffix = getMetadataRouteSuffix(page)
  }
  // Support both /<metadata-route.ext> and custom routes /<metadata-route>/route.ts.
  // If it's a metadata file route, we need to append /[id]/route to the page.
  if (!route.endsWith('/route')) {
    const { dir, name: baseName, ext } = path.parse(route)
    route = path.posix.join(
      dir,
      `${baseName}${suffix ? `-${suffix}` : ''}${ext}`,
      'route'
    )
  }

  return route
}

// Normalize metadata route page to either a single route or a dynamic route.
// e.g. Input: /sitemap/route
// when isDynamic is false, single route -> /sitemap.xml/route
// when isDynamic is false, dynamic route -> /sitemap/[__metadata_id__]/route
// also works for pathname such as /sitemap -> /sitemap.xml, but will not append /route suffix
export function normalizeMetadataPageToRoute(page: string, isDynamic: boolean) {
  const isRoute = page.endsWith('/route')
  const routePagePath = isRoute ? page.slice(0, -'/route'.length) : page
  const metadataRouteExtension = routePagePath.endsWith('/sitemap')
    ? '.xml'
    : ''
  const mapped = isDynamic
    ? `${routePagePath}/[__metadata_id__]`
    : `${routePagePath}${metadataRouteExtension}`

  return mapped + (isRoute ? '/route' : '')
}
