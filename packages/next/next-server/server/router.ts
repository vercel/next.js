import { IncomingMessage, ServerResponse } from 'http'
import { UrlWithParsedQuery } from 'url'
import pathMatch from './lib/path-match'

export const route = pathMatch()

export type Params = { [param: string]: any }

export type RouteMatch = (pathname: string | undefined) => false | Params

type RouteResult = {
  finished: boolean
  pathname?: string
  query?: { [k: string]: string }
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

export type DynamicRoutes = Array<{ page: string; match: RouteMatch }>

export type PageChecker = (pathname: string) => Promise<boolean>

export default class Router {
  routes: Route[]
  fsRoutes: Route[]
  catchAllRoute: Route
  pageChecker: PageChecker
  dynamicRoutes: DynamicRoutes

  constructor({
    routes = [],
    fsRoutes = [],
    catchAllRoute,
    dynamicRoutes = [],
    pageChecker,
  }: {
    routes: Route[]
    fsRoutes: Route[]
    catchAllRoute: Route
    dynamicRoutes: DynamicRoutes | undefined
    pageChecker: PageChecker
  }) {
    this.routes = routes
    this.fsRoutes = fsRoutes
    this.pageChecker = pageChecker
    this.catchAllRoute = catchAllRoute
    this.dynamicRoutes = dynamicRoutes
  }

  setDynamicRoutes(routes: DynamicRoutes = []) {
    this.dynamicRoutes = routes
  }

  add(route: Route) {
    this.routes.unshift(route)
  }

  async execute(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    // memoize page check calls so we don't duplicate checks for pages
    const pageChecks: { [name: string]: boolean } = {}
    const memoizedPageChecker = async (p: string): Promise<boolean> => {
      if (pageChecks[p]) {
        return pageChecks[p]
      }
      const result = await this.pageChecker(p)
      pageChecks[p] = result
      return result
    }

    let parsedUrlUpdated = parsedUrl

    for (const route of [...this.fsRoutes, ...this.routes]) {
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

        if (result.query) {
          parsedUrlUpdated.query = {
            ...parsedUrlUpdated.query,
            ...result.query,
          }
        }

        // check filesystem
        if (route.check === true) {
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

          let matchedPage = await memoizedPageChecker(
            parsedUrlUpdated.pathname!
          )

          // If we didn't match a page check dynamic routes
          if (!matchedPage) {
            for (const dynamicRoute of this.dynamicRoutes) {
              if (dynamicRoute.match(parsedUrlUpdated.pathname)) {
                matchedPage = true
              }
            }
          }

          // Matched a page or dynamic route so render it using catchAllRoute
          if (matchedPage) {
            const pageParams = this.catchAllRoute.match(
              parsedUrlUpdated.pathname
            )

            await this.catchAllRoute.fn(
              req,
              res,
              pageParams as Params,
              parsedUrlUpdated
            )
            return true
          }
        }
      }
    }

    return false
  }
}
