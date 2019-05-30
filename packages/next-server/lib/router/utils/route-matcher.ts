import { getRouteRegex } from './route-regex'

export function getRouteMatcher(routeRegex: ReturnType<typeof getRouteRegex>) {
  const { re, groups } = routeRegex
  return (pathname: string | undefined) => {
    const routeMatch = re.exec(pathname!)
    if (!routeMatch) {
      return false
    }

    const params: { [paramName: string]: string } = {}

    Object.keys(groups).forEach((slugName: string) => {
      const m = routeMatch[groups[slugName]]
      if (m !== undefined) {
        params[slugName] = decodeURIComponent(m)
      }
    })
    return params
  }
}
