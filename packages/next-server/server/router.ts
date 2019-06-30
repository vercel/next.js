import { IncomingMessage, ServerResponse } from 'http'
import { UrlWithParsedQuery } from 'url'
import pathMatch from './lib/path-match'

export const route = pathMatch()

export type Params = { [param: string]: any }

export type RouteMatch = (pathname: string | undefined) => false | Params

export type Route = {
  match: RouteMatch
  fn: (
    req: IncomingMessage,
    res: ServerResponse,
    params: Params,
    parsedUrl: UrlWithParsedQuery
  ) => void
}

export default class Router {
  routes: Route[]
  constructor(routes: Route[] = []) {
    this.routes = routes
  }

  add(route: Route) {
    this.routes.unshift(route)
  }

  match(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ) {
    const { pathname } = parsedUrl
    for (const route of this.routes) {
      const params = route.match(pathname)
      if (params) {
        return () => route.fn(req, res, params, parsedUrl)
      }
    }
  }
}
