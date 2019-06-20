export function isDynamicRoute(route: string): boolean {
  return route.indexOf('/$') !== -1
}
