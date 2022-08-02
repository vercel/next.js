import type { RouteRegex } from './route-regex'
import type { BaseNextRequest } from '../../../../server/base-http'
import type { MiddlewareMatcher } from '../../../../build/analysis/get-page-static-info'
import { DecodeError } from '../../utils'
import { matchHas } from './prepare-destination'

export interface RouteMatch {
  (pathname: string | null | undefined): false | Params
}

export interface MiddlewareRouteMatch {
  (
    pathname: string | null | undefined,
    request: BaseNextRequest,
    query: Params
  ): boolean
}

export interface Params {
  [param: string]: any
}

export function getRouteMatcher({ re, groups }: RouteRegex): RouteMatch {
  return (pathname: string | null | undefined) => {
    const routeMatch = re.exec(pathname!)
    if (!routeMatch) {
      return false
    }

    const decode = (param: string) => {
      try {
        return decodeURIComponent(param)
      } catch (_) {
        throw new DecodeError('failed to decode param')
      }
    }
    const params: { [paramName: string]: string | string[] } = {}

    Object.keys(groups).forEach((slugName: string) => {
      const g = groups[slugName]
      const m = routeMatch[g.pos]
      if (m !== undefined) {
        params[slugName] = ~m.indexOf('/')
          ? m.split('/').map((entry) => decode(entry))
          : g.repeat
          ? [decode(m)]
          : decode(m)
      }
    })
    return params
  }
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

      if (matcher.has) {
        const hasParams = matchHas(req, matcher.has, query)
        if (!hasParams) {
          continue
        }
      }

      return true
    }

    return false
  }
}
