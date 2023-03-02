export function isAppRouteRoute(route: string): boolean {
  return route.endsWith('/route')
}

// TODO: support more metadata routes
const staticMetadataRoutes = ['robots.txt', 'sitemap.xml']
export function isMetadataRoute(route: string): boolean {
  // Remove the 'app/' or '/' prefix, only check the route name since they're only allowed in root app directory
  const filename = route.replace(/^app\//, '').replace(/^\//, '')
  return staticMetadataRoutes.includes(filename)
}
