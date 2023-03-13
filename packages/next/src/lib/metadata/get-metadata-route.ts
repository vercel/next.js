import { isMetadataRoute, isStaticMetadataRoute } from './is-metadata-route'

/**
 * Map metadata page key to the corresponding route
 *
 * static file page key:    app/robots.txt -> /robots.xml -> /robots.txt/route
 * dynamic route page key:  app/robots.tsx -> /robots -> /robots.txt/route
 *
 * @param page
 * @returns
 */
export function getMetadataRoute(page: string) {
  let route = page
  if (isMetadataRoute(page)) {
    if (!isStaticMetadataRoute(route)) {
      if (route === '/sitemap') {
        route += '.xml'
      }
      if (route === '/robots') {
        route += '.txt'
      }
      if (route === '/favicon') {
        route += '.ico'
      }
    }
    route = `${route}/route`
  }
  return route
}
