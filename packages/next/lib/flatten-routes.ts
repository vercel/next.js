import pathMatch from '../next-server/server/lib/path-match'

const routeMatcher = pathMatch()

type Route = {
  source: string
  destination: string
}

export type Redirect = Route & {
  statusCode?: number
}

export type Rewrite = Route

export default function flattenRoutes(routes: Redirect[]): Redirect[] {
  let tmpRoutes = routes.map(r => ({
    ...r,
    matcher: routeMatcher(r.source),
  }))

  const flatten = (route: any, prev?: Set<string>): any => {
    for (const subRoute of tmpRoutes) {
      if (subRoute.matcher(route.destination)) {
        prev = prev || new Set()

        if (prev.has(subRoute.destination)) {
          throw new Error(
            `Infinite redirect/rewrite detected for ${route.source} to ${
              subRoute.destination
            }`
          )
        }
        prev.add(route.destination)

        return flatten(
          {
            ...route,
            statusCode: subRoute.statusCode,
            destination: subRoute.destination,
          },
          prev
        )
      }
    }
    return route
  }

  tmpRoutes = tmpRoutes.map(r => flatten(r))
  tmpRoutes.forEach(r => {
    if (typeof r.statusCode === 'undefined') {
      delete r.statusCode
    }
    delete r.matcher
  })

  return tmpRoutes
}
