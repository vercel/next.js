import { getParametrizedRoute, RouteRegex } from './route-regex'

// Identify ^/[param]/ in route string
const FIRST_SEGMENT_DYNAMIC = /^\/\[[^/]+?\](?=\/|$)/

const NOT_API_ROUTE = '(?!/api(?:/|$))'

export function getMiddlewareRegex(
  normalizedRoute: string,
  catchAll: boolean = true
): RouteRegex {
  const result = getParametrizedRoute(normalizedRoute)
  const notApiRegex = FIRST_SEGMENT_DYNAMIC.test(normalizedRoute)
    ? NOT_API_ROUTE
    : ''

  let catchAllRegex = catchAll ? '(?!_next($|/)).*' : ''
  let catchAllGroupedRegex = catchAll ? '(?:(/.*)?)' : ''

  if ('routeKeys' in result) {
    if (result.parameterizedRoute === '/') {
      return {
        groups: {},
        namedRegex: `^/${catchAllRegex}$`,
        re: new RegExp(`^/${catchAllRegex}$`),
        routeKeys: {},
      }
    }

    return {
      groups: result.groups,
      namedRegex: `^${notApiRegex}${result.namedParameterizedRoute}${catchAllGroupedRegex}$`,
      re: new RegExp(
        `^${notApiRegex}${result.parameterizedRoute}${catchAllGroupedRegex}$`
      ),
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
    re: new RegExp(
      `^${notApiRegex}${result.parameterizedRoute}${catchAllGroupedRegex}$`
    ),
  }
}
