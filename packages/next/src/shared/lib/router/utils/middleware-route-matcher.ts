import type { BaseNextRequest } from '../../../../server/base-http'
import type { ProxyMatcher } from '../../../../build/analysis/get-page-static-info'
import type { Params } from '../../../../server/request/params'
import { matchHas } from './prepare-destination'

export interface MiddlewareRouteMatch {
  (
    pathname: string | null | undefined,
    request: BaseNextRequest,
    query: Params
  ): boolean
}

export function getMiddlewareRouteMatcher(
  matchers: ProxyMatcher[]
): MiddlewareRouteMatch {
  const compiled = matchers.map((matcher) => ({
    ...matcher,
    re: new RegExp(matcher.regexp),
  }))
  return (
    pathname: string | null | undefined,
    req: BaseNextRequest,
    query: Params
  ) => {
    for (const matcher of compiled) {
      const routeMatch = matcher.re.exec(pathname!)
      if (!routeMatch) {
        continue
      }

      if (matcher.has || matcher.missing) {
        const hasParams = matchHas(req, query, matcher.has, matcher.missing)
        if (!hasParams) {
          continue
        }
      }

      return true
    }

    return false
  }
}
