import { getParametrizedRoute, RouteRegex } from './route-regex'

export function getMiddlewareRegex(
  normalizedRoute: string,
  catchAll: boolean = true
): RouteRegex {
  const result = getParametrizedRoute(normalizedRoute)

  let catchAllRegex = catchAll ? '.*' : ''
  let catchAllGroupedRegex = catchAll ? '(?:(/.*)?)' : ''

  if ('routeKeys' in result) {
    if (result.parameterizedRoute === '/') {
      return {
        groups: {},
        namedRegex: `^/(?!_next)${catchAllRegex}$`,
        re: new RegExp(`^/(?!_next)${catchAllRegex}$`),
        routeKeys: {},
      }
    }

    return {
      groups: result.groups,
      namedRegex: `^${result.namedParameterizedRoute}${catchAllGroupedRegex}$`,
      re: new RegExp(`^${result.parameterizedRoute}${catchAllGroupedRegex}$`),
      routeKeys: result.routeKeys,
    }
  }

  if (result.parameterizedRoute === '/') {
    return {
      groups: {},
      re: new RegExp(`^/${catchAllRegex}$`),
    }
  }

  return {
    groups: {},
    re: new RegExp(`^${result.parameterizedRoute}${catchAllGroupedRegex}$`),
  }
}
