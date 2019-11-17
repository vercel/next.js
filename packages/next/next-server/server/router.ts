import { IncomingMessage, ServerResponse } from 'http'
import { UrlWithParsedQuery } from 'url'
import pathMatch from './lib/path-match'
import { DEFAULT_REDIRECT_STATUS } from '../lib/constants'

export const route = pathMatch()

export type Params = { [param: string]: any }

export type RouteMatch = (pathname: string | undefined) => false | Params

type RouteResult = {
  finished: boolean
  pathname?: string
}

export type Route = {
  match: RouteMatch
  type: string
  statusCode?: number
  name: string
  fn: (
    req: IncomingMessage,
    res: ServerResponse,
    params: Params,
    parsedUrl: UrlWithParsedQuery
  ) => Promise<RouteResult> | RouteResult
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

  async execute(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    let parsedUrlUpdated = parsedUrl
    let lastMatch:
      | {
          route: Route
          result: RouteResult
        }
      | undefined
    for (const route of this.routes) {
      // If a redirect is matched we try to deeply resolve it so that you don't get
      // double redirects. However this means we have to check until the type is not a redirect
      // as otherwise there'd be an accidental redirect.
      if (
        lastMatch &&
        lastMatch.route.type === 'redirect' &&
        route.type !== 'redirect'
      ) {
        break
      }

      const params = route.match(parsedUrlUpdated.pathname)

      // Check if the match function matched
      if (params) {
        const result = await route.fn(req, res, params, parsedUrlUpdated)
        // The response was handled
        if (result.finished) {
          return true
        }

        lastMatch = {
          route,
          result,
        }

        if (result.pathname) {
          parsedUrlUpdated.pathname = result.pathname
        }
      }
    }

    if (
      lastMatch &&
      lastMatch.route.type === 'redirect' &&
      lastMatch.result.pathname
    ) {
      // TODO: Discuss if querystring is/should be supported.
      res.setHeader('Location', lastMatch.result.pathname)
      res.statusCode = lastMatch.route.statusCode || DEFAULT_REDIRECT_STATUS
      res.end()
      return true
    }

    return false
  }
}
