import { isMetadataRoute } from './is-metadata-route'
import path from '../../shared/lib/isomorphic/path'
import { djb2Hash } from '../../shared/lib/hash'

/*
 * If there's special convention like (...) or @ in the page path,
 * Give it a unique hash suffix to avoid conflicts
 *
 * e.g.
 * /app/open-graph.tsx -> /open-graph/route
 * /app/(post)/open-graph.tsx -> /open-graph/route-[0-9a-z]{6}
 */
export function getMetadataRouteSuffix(page: string) {
  let suffix = ''

  if ((page.includes('(') && page.includes(')')) || page.includes('@')) {
    suffix = djb2Hash(page).toString(36).slice(0, 6)
  }
  return suffix
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
  let route = page
  if (isMetadataRoute(page)) {
    // Remove the file extension, e.g. /route-path/robots.txt -> /route-path
    const pathnamePrefix = page.slice(0, -(path.basename(page).length + 1))
    const suffix = getMetadataRouteSuffix(pathnamePrefix)

    if (route === '/sitemap') {
      route += '.xml'
    }
    if (route === '/robots') {
      route += '.txt'
    }
    if (route === '/manifest') {
      route += '.webmanifest'
    }
    // Support both /<metadata-route.ext> and custom routes /<metadata-route>/route.ts.
    // If it's a metadata file route, we need to append /route to the page.
    if (!route.endsWith('/route')) {
      route = `${route}${suffix ? `-${suffix}` : ''}/route`
    }
  }
  return route
}
