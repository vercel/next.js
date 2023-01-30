export function isAppRoute(route: string): boolean {
  return route.endsWith('/route')
}

export function isAppRoutePathname(
  pathname: string,
  appPathRoutes?: Record<string, string[]>
): string | false {
  if (!appPathRoutes) return false

  const routes = appPathRoutes[pathname]
  if (!routes) return false

  const route = routes[0]
  if (!route || !isAppRoute(routes[0])) return false

  return route
}
