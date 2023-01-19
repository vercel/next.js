export function isCustomAppRoute(route: string): boolean {
  return route.endsWith('/route')
}

export function isCustomAppRoutePathname(
  pathname: string,
  appPathRoutes?: Record<string, string[]>
): string | false {
  if (!appPathRoutes) return false

  const routes = appPathRoutes[pathname]
  if (!routes) return false

  const route = routes[0]
  if (!route || !isCustomAppRoute(routes[0])) return false

  return route
}
