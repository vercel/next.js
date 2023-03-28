import type { RouteRegex } from './route-regex'
import { DecodeError } from '../../utils'

export interface RouteMatchFn {
  (pathname: string | null | undefined): false | Params
}

export interface Params {
  [param: string]: any
}

export function getRouteMatcher({ re, groups }: RouteRegex): RouteMatchFn {
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
