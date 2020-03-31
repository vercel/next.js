import { getRouteRegex } from './route-regex'
// @ts-ignore no types
import safeDecodeUriComponent from 'safe-decode-uri-component'

export function getRouteMatcher(routeRegex: ReturnType<typeof getRouteRegex>) {
  const { re, groups } = routeRegex
  return (pathname: string | null | undefined) => {
    const routeMatch = re.exec(pathname!)
    if (!routeMatch) {
      return false
    }

    const decode = safeDecodeUriComponent
    const params: { [paramName: string]: string | string[] } = {}

    Object.keys(groups).forEach((slugName: string) => {
      const g = groups[slugName]
      const m = routeMatch[g.pos]
      if (m !== undefined) {
        params[slugName] = ~m.indexOf('/')
          ? m.split('/').map(entry => decode(entry))
          : g.repeat
          ? [decode(m)]
          : decode(m)
      }
    })
    return params
  }
}
