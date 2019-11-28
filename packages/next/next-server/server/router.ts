import { IncomingMessage, ServerResponse } from 'http'
import { UrlWithParsedQuery } from 'url'
import pathMatch from './lib/path-match'

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
  check?: boolean
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
  fsRoutes: Route[]

  constructor({
    routes = [],
    fsRoutes = [],
  }: {
    routes: Route[]
    fsRoutes: Route[]
  }) {
    this.routes = routes
    this.fsRoutes = fsRoutes
  }

  add(route: Route) {
    this.routes.unshift(route)
  }

  async execute(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    let parsedUrlUpdated = parsedUrl
    for (const route of this.routes) {
      const newParams = route.match(parsedUrlUpdated.pathname)

      // Check if the match function matched
      if (newParams) {
        // Combine parameters and querystring
        if (route.type === 'rewrite' || route.type === 'redirect') {
          parsedUrlUpdated.query = { ...parsedUrlUpdated.query, ...newParams }
        }

        const result = await route.fn(req, res, newParams, parsedUrlUpdated)

        // The response was handled
        if (result.finished) {
          return true
        }

        if (result.pathname) {
          parsedUrlUpdated.pathname = result.pathname
        }

        // check filesystem
        if (route.check === true) {
          // TODO: investigate if we need to check for a page here also
          for (const fsRoute of this.fsRoutes) {
            const fsParams = fsRoute.match(parsedUrlUpdated.pathname)

            if (fsParams) {
              const result = await fsRoute.fn(
                req,
                res,
                fsParams,
                parsedUrlUpdated
              )

              if (result.finished) {
                return true
              }
            }
          }
        }
      }
    }

    return false
  }
}
