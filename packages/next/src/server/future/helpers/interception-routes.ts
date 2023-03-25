export function isIntersectionRouteAppPath(path: string): boolean {
  // TODO-APP: add more serious validation
  return (
    path
      .split('/')
      .find(
        (p) =>
          p.startsWith('(..)') ||
          p.startsWith('(...)') ||
          p.startsWith('(..)(..)')
      ) !== undefined
  )
}

export function getInterceptingRouteMeta(path: string) {
  let [interceptingRoute, dots, interceptedRoute] = path.split(
    /\((\.{2,3}|\.{2}\)\(\.{2})?\)/
  )
  interceptingRoute = interceptingRoute.slice(0, -1)

  if (dots === '..') {
    interceptedRoute =
      interceptingRoute.split('/').slice(0, -1).join('/') +
      '/' +
      interceptedRoute
  }

  if (dots === '...') {
    interceptedRoute = '/' + interceptedRoute
  }

  if (dots === '..)(..') {
    interceptedRoute =
      interceptingRoute.split('/').slice(0, -2).join('/') +
      '/' +
      interceptedRoute
  }
  return [interceptingRoute, interceptedRoute]
}
