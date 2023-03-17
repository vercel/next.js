import { isMetadataRoute } from './is-metadata-route'

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
    // TODO-METADATA: add dynamic routes for metadata images.
    // Better to move the extension appending to early phase.
    if (route === '/sitemap') {
      route += '.xml'
    }
    if (route === '/robots') {
      route += '.txt'
    }
    if (route === '/manifest') {
      route += '.webmanifest'
    }
    route = `${route}/route`
  }
  return route
}
