import type { BaseNextRequest } from '../../../../server/base-http'
import type { MiddlewareMatcher } from '../../../../build/analysis/get-page-static-info'
import type { Params } from './route-matcher'
import { matchHas } from './prepare-destination'

export interface MiddlewareRouteMatch {
  (
    pathname: string | null | undefined,
    request: BaseNextRequest,
    query: Params
  ): boolean
}

export function getMiddlewareRouteMatcher(
  matchers: MiddlewareMatcher[]
): MiddlewareRouteMatch {
  return (
    pathname: string | null | undefined,
    req: BaseNextRequest,
    query: Params
  ) => {
    for (const matcher of matchers) {
      const routeMatch = new RegExp(matcher.regexp).exec(pathname!)
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
