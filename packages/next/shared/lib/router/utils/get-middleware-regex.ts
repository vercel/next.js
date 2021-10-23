import { getParametrizedRoute, RouteRegex } from './route-regex'

export function getMiddlewareRegex(normalizedRoute: string): RouteRegex {
  const result = getParametrizedRoute(normalizedRoute)
  if ('routeKeys' in result) {
    if (result.parameterizedRoute === '/') {
      return {
        groups: {},
        namedRegex: `^/(?!_next).*$`,
        re: new RegExp('^/(?!_next).*$'),
        routeKeys: {},
      }
    }

    return {
      groups: result.groups,
      namedRegex: `^${result.namedParameterizedRoute}(?:(/.*)?)$`,
      re: new RegExp(`^${result.parameterizedRoute}(?:(/.*)?)$`),
      routeKeys: result.routeKeys,
    }
  }

  if (result.parameterizedRoute === '/') {
    return {
      groups: {},
      re: new RegExp('^/.*$'),
    }
  }

  return {
    groups: {},
    re: new RegExp(`^${result.parameterizedRoute}(?:(/.*)?)$`),
  }
}
