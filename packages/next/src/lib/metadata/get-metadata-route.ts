import { isMetadataPage } from './is-metadata-route'
import path from '../../shared/lib/isomorphic/path'
import { interpolateDynamicPath } from '../../server/server-utils'
import { getNamedRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { PARAMETER_PATTERN } from '../../shared/lib/router/utils/get-dynamic-param'
import { djb2Hash } from '../../shared/lib/hash'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { isDynamicRoute } from '../../shared/lib/router/utils'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import { isMetadataRouteFile } from './is-metadata-route'
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
  if (page.endsWith('/sitemap') || page.endsWith('/sitemap.xml')) {
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

function getMetadataRouteFilename(segment: string, lastSegment: string) {
  const { name, ext } = path.parse(lastSegment)
  const pagePath = path.posix.join(segment, name)
  const suffix = getMetadataRouteSuffix(pagePath)
  const routeSuffix = suffix ? `-${suffix}` : ''

  return `${name}${routeSuffix}${ext}`
}

function normalizeStaticMetadataRouteSegment(segment: string) {
  let normalizedSegment = segment
  let match = normalizedSegment.match(PARAMETER_PATTERN)

  while (match) {
    normalizedSegment = `${match[1]}-${match[3]}`
    match = normalizedSegment.match(PARAMETER_PATTERN)
  }

  return normalizedSegment
}

function getStaticMetadataRoute(segment: string) {
  const pathname = normalizeAppPath(segment)

  return normalizePathSep(
    path.join(
      '/',
      ...pathname
        .split('/')
        .filter(Boolean)
        .map((pathnameSegment) =>
          normalizeStaticMetadataRouteSegment(pathnameSegment)
        )
    )
  )
}

export function fillStaticMetadataSegment(
  segment: string,
  lastSegment: string
) {
  return normalizePathSep(
    path.join(
      getStaticMetadataRoute(segment),
      getMetadataRouteFilename(segment, lastSegment)
    )
  )
}

/**
 * Returns the pathname used when prerendering static metadata files. Dynamic
 * segments are replaced with "-" placeholders so the file is exported once.
 */
export function getStaticMetadataPrerenderPathname(
  pathname: string
): string | null {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (!isMetadataRouteFile(normalized, [], true)) {
    return null
  }

  if (!isDynamicRoute(normalized)) {
    return normalized
  }

  const lastSlash = normalized.lastIndexOf('/')
  if (lastSlash === -1) {
    return normalized
  }

  const segment = normalized.slice(0, lastSlash) || '/'
  const lastSegment = normalized.slice(lastSlash + 1)
  return fillStaticMetadataSegment(segment, lastSegment)
}

/**
 * Fill the dynamic segment in the metadata route
 *
 * Example:
 * fillMetadataSegment('/a/[slug]', { params: { slug: 'b' } }, 'open-graph', false) -> '/a/b/open-graph'
 *
 * When isStatic is true, all dynamic segments are filled with "-" placeholder
 * since static metadata files have consistent responses regardless of params.
 * Example:
 * fillMetadataSegment('/a/[slug]', {}, 'icon.png', true) -> '/a/-/icon.png'
 *
 */
export function fillMetadataSegment(
  segment: string,
  params: any,
  lastSegment: string,
  isStatic: boolean
) {
  if (isStatic) {
    return fillStaticMetadataSegment(segment, lastSegment)
  }

  const pathname = normalizeAppPath(segment)
  const routeRegex = getNamedRouteRegex(pathname, {
    prefixRouteKeys: false,
  })
  const route = interpolateDynamicPath(pathname, params, routeRegex)

  return normalizePathSep(
    path.join(route, getMetadataRouteFilename(segment, lastSegment))
  )
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
  if (!isMetadataPage(page)) {
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
