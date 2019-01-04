import {IncomingMessage, ServerResponse} from 'http'
import {UrlWithParsedQuery} from 'url'
import pathMatch from './lib/path-match'

export const route = pathMatch()

type Params = {[param: string]: string}

export type Route = {
  match: (pathname: string|undefined) => false|Params,
  fn: (req: IncomingMessage, res: ServerResponse, params: Params, parsedUrl: UrlWithParsedQuery) => void,
}

export default class Router {
  routes: Route[]
  constructor(routes: Route[] = []) {
    this.routes = routes
  }

  add(route: Route) {
    this.routes.unshift(route)
  }

  match(req: IncomingMessage, res: ServerResponse, parsedUrl: UrlWithParsedQuery) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return
    }

    const { pathname } = parsedUrl
    for (const route of this.routes) {
      const params = route.match(pathname)
      if (params) {
        return () => route.fn(req, res, params, parsedUrl)
      }
    }
  }
}
