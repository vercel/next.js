import type { Group } from './route-regex'
import { DecodeError } from '../../utils'
import type { Params } from '../../../../server/request/params'

export interface RouteMatchFn {
  (pathname: string): false | Params
}

type RouteMatcherOptions = {
  // We only use the exec method of the RegExp object. This helps us avoid using
  // type assertions that the passed in properties are of the correct type.
  re: Pick<RegExp, 'exec'>
  groups: Record<string, Group>
}

export function getRouteMatcher({
  re,
  groups,
}: RouteMatcherOptions): RouteMatchFn {
  return (pathname: string) => {
    const routeMatch = re.exec(pathname)
    if (!routeMatch) return false

    const decode = (param: string) => {
      try {
        return decodeURIComponent(param)
      } catch {
        throw new DecodeError('failed to decode param')
      }
    }

    const params: Params = {}
    for (const [key, group] of Object.entries(groups)) {
      const match = routeMatch[group.pos]
      if (match !== undefined) {
        if (group.repeat) {
          params[key] = match.split('/').map((entry) => decode(entry))
        } else {
          params[key] = decode(match)
        }
      }
    }

    return params
  }
}
