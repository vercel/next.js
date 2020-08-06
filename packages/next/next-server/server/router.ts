import { IncomingMessage, ServerResponse } from 'http'
import { parse as parseUrl, UrlWithParsedQuery } from 'url'
import { ParsedUrlQuery } from 'querystring'
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
  requireBasePath?: false
  fn: (
    req: IncomingMessage,
    res: ServerResponse,
    params: Params,
    parsedUrl: UrlWithParsedQuery
  ) => Promise<RouteResult> | RouteResult
}

export type DynamicRoutes = Array<{ page: string; match: RouteMatch }>

export type PageChecker = (pathname: string) => Promise<boolean>

const customRouteTypes = new Set(['rewrite', 'redirect', 'header'])

export const prepareDestination = (
  destination: string,
  params: Params,
  query: ParsedUrlQuery,
  appendParamsToQuery: boolean,
  basePath: string
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
      // the value needs to start with a forward-slash to be compiled
      // correctly
      value = `/${value}`
      const queryCompiler = compilePathToRegex(value, { validate: false })
      value = queryCompiler(params).substr(1)
    }
    destQuery[key] = value
  }

  // add path params to query if it's not a redirect and not
  // already defined in destination query
  if (appendParamsToQuery) {
    for (const [name, value] of Object.entries(params)) {
      if (!(name in destQuery)) {
        destQuery[name] = value
      }
    }
  }

  const shouldAddBasePath = destination.startsWith('/') && basePath

  try {
    newUrl = `${shouldAddBasePath ? basePath : ''}${encodeURI(
      destinationCompiler(params)
    )}`

    const [pathname, hash] = newUrl.split('#')
    parsedDestination.pathname = pathname
    parsedDestination.hash = `${hash ? '#' : ''}${hash || ''}`
    parsedDestination.path = `${pathname}${parsedDestination.search}`
    delete parsedDestination.search
  } catch (err) {
    if (err.message.match(/Expected .*? to not repeat, but got an array/)) {
      throw new Error(
        `To use a multi-match in the destination you must add \`*\` at the end of the param name to signify it should repeat. https://err.sh/vercel/next.js/invalid-multi-match`
      )
    }
    throw err
  }

  // Query merge order lowest priority to highest
  // 1. initial URL query values
  // 2. path segment values
  // 3. destination specified query values
  parsedDestination.query = {
    ...query,
    ...parsedDestination.query,
  }

  return {
    newUrl,
    parsedDestination,
  }
}

function replaceBasePath(basePath: string, pathname: string) {
  return pathname!.replace(basePath, '') || '/'
}

export default class Router {
  basePath: string
  headers: Route[]
  fsRoutes: Route[]
  rewrites: Route[]
  redirects: Route[]
  catchAllRoute: Route
  pageChecker: PageChecker
  dynamicRoutes: DynamicRoutes
  useFileSystemPublicRoutes: boolean

  constructor({
    basePath = '',
    headers = [],
    fsRoutes = [],
    rewrites = [],
    redirects = [],
    catchAllRoute,
    dynamicRoutes = [],
    pageChecker,
    useFileSystemPublicRoutes,
  }: {
    basePath: string
    headers: Route[]
    fsRoutes: Route[]
    rewrites: Route[]
    redirects: Route[]
    catchAllRoute: Route
    dynamicRoutes: DynamicRoutes | undefined
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
  }) {
    this.basePath = basePath
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

  addFsRoute(fsRoute: Route) {
    this.fsRoutes.unshift(fsRoute)
  }

  async execute(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<boolean> {
    // memoize page check calls so we don't duplicate checks for pages
    const pageChecks: { [name: string]: Promise<boolean> } = {}
    const memoizedPageChecker = async (p: string): Promise<boolean> => {
      if (pageChecks[p]) {
        return pageChecks[p]
      }
      const result = this.pageChecker(p)
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

    const allRoutes = [
      ...this.headers,
      ...this.redirects,
      ...this.fsRoutes,
      // We only check the catch-all route if public page routes hasn't been
      // disabled
      ...(this.useFileSystemPublicRoutes
        ? [
            {
              type: 'route',
              name: 'page checker',
              requireBasePath: false,
              match: route('/:path*'),
              fn: async (checkerReq, checkerRes, params, parsedCheckerUrl) => {
                const { pathname } = parsedCheckerUrl

                if (!pathname) {
                  return { finished: false }
                }
                if (await memoizedPageChecker(pathname)) {
                  return this.catchAllRoute.fn(
                    checkerReq,
                    checkerRes,
                    params,
                    parsedCheckerUrl
                  )
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
    const originallyHadBasePath =
      !this.basePath || (req as any)._nextHadBasePath

    for (const testRoute of allRoutes) {
      // if basePath is being used, the basePath will still be included
      // in the pathname here to allow custom-routes to require containing
      // it or not, filesystem routes and pages must always include the basePath
      // if it is set
      let currentPathname = parsedUrlUpdated.pathname
      const originalPathname = currentPathname
      const requireBasePath = testRoute.requireBasePath !== false
      const isCustomRoute = customRouteTypes.has(testRoute.type)

      if (!isCustomRoute) {
        // If replace ends up replacing the full url it'll be `undefined`, meaning we have to default it to `/`
        currentPathname = replaceBasePath(this.basePath, currentPathname!)
      }

      const newParams = testRoute.match(currentPathname)

      // Check if the match function matched
      if (newParams) {
        // since we require basePath be present for non-custom-routes we
        // 404 here when we matched an fs route
        if (!isCustomRoute) {
          if (!originallyHadBasePath && !(req as any)._nextDidRewrite) {
            if (requireBasePath) {
              // consider this a non-match so the 404 renders
              return false
            }
            // page checker occurs before rewrites so we need to continue
            // to check those since they don't always require basePath
            continue
          }

          parsedUrlUpdated.pathname = currentPathname
        }

        const result = await testRoute.fn(req, res, newParams, parsedUrlUpdated)

        // The response was handled
        if (result.finished) {
          return true
        }

        // since the fs route didn't match we need to re-add the basePath
        // to continue checking rewrites with the basePath present
        if (!isCustomRoute) {
          parsedUrlUpdated.pathname = originalPathname
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
        if (testRoute.check === true) {
          const originalFsPathname = parsedUrlUpdated.pathname
          const fsPathname = replaceBasePath(this.basePath, originalFsPathname!)

          for (const fsRoute of this.fsRoutes) {
            const fsParams = fsRoute.match(fsPathname)

            if (fsParams) {
              parsedUrlUpdated.pathname = fsPathname

              const fsResult = await fsRoute.fn(
                req,
                res,
                fsParams,
                parsedUrlUpdated
              )

              if (fsResult.finished) {
                return true
              }

              parsedUrlUpdated.pathname = originalFsPathname
            }
          }

          let matchedPage = await memoizedPageChecker(fsPathname)

          // If we didn't match a page check dynamic routes
          if (!matchedPage) {
            for (const dynamicRoute of this.dynamicRoutes) {
              if (dynamicRoute.match(fsPathname)) {
                matchedPage = true
              }
            }
          }

          // Matched a page or dynamic route so render it using catchAllRoute
          if (matchedPage) {
            parsedUrlUpdated.pathname = fsPathname

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
