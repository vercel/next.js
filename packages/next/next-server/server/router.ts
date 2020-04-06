import { IncomingMessage, ServerResponse } from 'http'
import { parse as parseUrl, UrlWithParsedQuery } from 'url'
import { compile as compilePathToRegex } from 'next/dist/compiled/path-to-regexp'
import pathMatch from './lib/path-match'

export const route = pathMatch()

export type Params = { [param: string]: any }

export type RouteMatch = (pathname: string | null | undefined) => false | Params

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

export const prepareDestination = (
  destination: string,
  params: Params,
  isRedirect?: boolean
) => {
  const parsedDestination = parseUrl(destination, true)
  const destQuery = parsedDestination.query
  let destinationCompiler = compilePathToRegex(
    `${parsedDestination.pathname!}${parsedDestination.hash || ''}`,
    // we don't validate while compiling the destination since we should
    // have already validated before we got to this point and validating
    // breaks compiling destinations with named pattern params from the source
    // e.g. /something:hello(.*) -> /another/:hello is broken with validation
    // since compile validation is meant for reversing and not for inserting
    // params from a separate path-regex into another
    { validate: false }
  )
  let newUrl

  // update any params in query values
  for (const [key, strOrArray] of Object.entries(destQuery)) {
    let value = Array.isArray(strOrArray) ? strOrArray[0] : strOrArray
    if (value) {
      const queryCompiler = compilePathToRegex(value, { validate: false })
      value = queryCompiler(params)
    }
    destQuery[key] = value
  }

  // add params to query if it's not a redirect
  if (!isRedirect) {
    for (const [name, value] of Object.entries(params)) {
      if (!(name in destQuery)) {
        destQuery[name] = Array.isArray(value) ? value.join('/') : value
      }
    }
  }

  try {
    newUrl = encodeURI(destinationCompiler(params))

    const [pathname, hash] = newUrl.split('#')
    parsedDestination.pathname = pathname
    parsedDestination.hash = `${hash ? '#' : ''}${hash || ''}`
    parsedDestination.path = `${pathname}${parsedDestination.search}`
    delete parsedDestination.search
  } catch (err) {
    if (err.message.match(/Expected .*? to not repeat, but got an array/)) {
      throw new Error(
        `To use a multi-match in the destination you must add \`*\` at the end of the param name to signify it should repeat. https://err.sh/zeit/next.js/invalid-multi-match`
      )
    }
    throw err
  }
  return {
    newUrl,
    parsedDestination,
  }
}

export default class Router {
  headers: Route[]
  fsRoutes: Route[]
  rewrites: Route[]
  redirects: Route[]
  catchAllRoute: Route
  pageChecker: PageChecker
  dynamicRoutes: DynamicRoutes
  useFileSystemPublicRoutes: boolean

  constructor({
    headers = [],
    fsRoutes = [],
    rewrites = [],
    redirects = [],
    catchAllRoute,
    dynamicRoutes = [],
    pageChecker,
    useFileSystemPublicRoutes,
  }: {
    headers: Route[]
    fsRoutes: Route[]
    rewrites: Route[]
    redirects: Route[]
    catchAllRoute: Route
    dynamicRoutes: DynamicRoutes | undefined
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
  }) {
    this.headers = headers
    this.fsRoutes = fsRoutes
    this.rewrites = rewrites
    this.redirects = redirects
    this.pageChecker = pageChecker
    this.catchAllRoute = catchAllRoute
    this.dynamicRoutes = dynamicRoutes
    this.useFileSystemPublicRoutes = useFileSystemPublicRoutes
  }

  setDynamicRoutes(routes: DynamicRoutes = []) {
    this.dynamicRoutes = routes
  }

  addFsRoute(route: Route) {
    this.fsRoutes.unshift(route)
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

    /*
      Desired routes order
      - headers
      - redirects
      - Check filesystem (including pages), if nothing found continue
      - User rewrites (checking filesystem and pages each match)
    */

    const routes = [
      ...this.headers,
      ...this.redirects,
      ...this.fsRoutes,
      // We only check the catch-all route if public page routes hasn't been
      // disabled
      ...(this.useFileSystemPublicRoutes
        ? [
            {
              type: 'route',
              name: 'Page checker',
              match: route('/:path*'),
              fn: async (req, res, params, parsedUrl) => {
                const { pathname } = parsedUrl

                if (!pathname) {
                  return { finished: false }
                }
                if (await this.pageChecker(pathname)) {
                  return this.catchAllRoute.fn(req, res, params, parsedUrl)
                }
                return { finished: false }
              },
            } as Route,
          ]
        : []),
      ...this.rewrites,
      // We only check the catch-all route if public page routes hasn't been
      // disabled
      ...(this.useFileSystemPublicRoutes ? [this.catchAllRoute] : []),
    ]

    for (const route of routes) {
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
