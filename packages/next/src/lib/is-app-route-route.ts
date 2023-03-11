import path from '../shared/lib/isomorphic/path'

export function isAppRouteRoute(route: string): boolean {
  return route.endsWith('/route')
}

// Match routes that are metadata routes, e.g. /sitemap.xml, /favicon.<ext>, /<icon>.<ext>, etc.
// TODO-METADATA: support more metadata routes with more extensions
const staticMetadataRoutes = ['robots.txt', 'sitemap.xml', 'favicon.ico']
export function isMetadataRoute(route: string): boolean {
  // Remove the 'app/' or '/' prefix, only check the route name since they're only allowed in root app directory
  const filename = route.replace(/^app\//, '').replace(/^\//, '')
  return staticMetadataRoutes.includes(filename)
}

// Only match the static metadata files
// TODO-METADATA: support static metadata files under nested routes folders
export function isStaticMetadataRoute(resourcePath: string) {
  const filename = path.basename(resourcePath)
  return staticMetadataRoutes.includes(filename)
}
