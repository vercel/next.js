export function isAppRouteRoute(route: string): boolean {
  return route.endsWith('/route')
}

// Match routes that are metadata routes, e.g. /sitemap.xml, /favicon.<ext>, /<icon>.<ext>, etc.
// TODO-METADATA: support more metadata routes with more extensions
const staticMetadataRoutes = [/robots\.txt/, /sitemap\.xml/, /favicon\.ico/]
export function isMetadataRoute(route: string): boolean {
  // Remove the 'app/' or '/' prefix, only check the route name since they're only allowed in root app directory
  const filename = route
    .replace(/^app\//, '')
    .replace(/^\//, '')
    .replace(/\/route$/, '')
  return staticMetadataRoutes.some((r) => r.test(filename))
}

// Only match the static metadata files
// TODO-METADATA: support static metadata files under nested routes folders
export function isStaticMetadataRoute(resourcePath: string) {
  return staticMetadataRoutes.some((r) => r.test(resourcePath))
}
