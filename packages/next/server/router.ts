import type { ParsedUrlQuery } from 'querystring'
import type { BaseNextRequest, BaseNextResponse } from './base-http'

import { getNextInternalQuery, NextUrlWithParsedQuery } from './request-meta'
import pathMatch from '../shared/lib/router/utils/path-match'
import { removePathTrailingSlash } from '../client/normalize-trailing-slash'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { RouteHas } from '../lib/load-custom-routes'
import { matchHas } from '../shared/lib/router/utils/prepare-destination'
import { getRequestMeta } from './request-meta'

export const route = pathMatch()

export type Params = { [param: string]: any }

export type RouteMatch = (pathname: string | null | undefined) => false | Params

type RouteResult = {
  finished: boolean
  pathname?: string
  query?: ParsedUrlQuery
}

export type Route = {
  match: RouteMatch
  has?: RouteHas[]
  type: string
  check?: boolean
  statusCode?: number
  name: string
  requireBasePath?: false
  internal?: true
  fn: (
    req: BaseNextRequest,
    res: BaseNextResponse,
    params: Params,
    parsedUrl: NextUrlWithParsedQuery
  ) => Promise<RouteResult> | RouteResult
}

export type DynamicRoutes = Array<{ page: string; match: RouteMatch }>

export type PageChecker = (pathname: string) => Promise<boolean>

const customRouteTypes = new Set(['rewrite', 'redirect', 'header'])

export function hasBasePath(pathname: string, basePath: string): boolean {
  return (
    typeof pathname === 'string' &&
    (pathname === basePath || pathname.startsWith(basePath + '/'))
  )
}

export function replaceBasePath(pathname: string, basePath: string): string {
  // ensure basePath is only stripped if it matches exactly
  // and doesn't contain extra chars e.g. basePath /docs
  // should replace for /docs, /docs/, /docs/a but not /docsss
  if (hasBasePath(pathname, basePath)) {
    pathname = pathname.slice(basePath.length)
    if (!pathname.startsWith('/')) pathname = `/${pathname}`
  }
  return pathname
}

export default class Router {
  basePath: string
  headers: Route[]
  fsRoutes: Route[]
  redirects: Route[]
  rewrites: {
    beforeFiles: Route[]
    afterFiles: Route[]
    fallback: Route[]
  }
  catchAllRoute: Route
  catchAllMiddleware?: Route
  pageChecker: PageChecker
  dynamicRoutes: DynamicRoutes
  useFileSystemPublicRoutes: boolean
  locales: string[]
  seenRequests: Set<any>

  constructor({
    basePath = '',
    headers = [],
    fsRoutes = [],
    rewrites = {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    },
    redirects = [],
    catchAllRoute,
    catchAllMiddleware,
    dynamicRoutes = [],
    pageChecker,
    useFileSystemPublicRoutes,
    locales = [],
  }: {
    basePath: string
    headers: Route[]
    fsRoutes: Route[]
    rewrites: {
      beforeFiles: Route[]
      afterFiles: Route[]
      fallback: Route[]
    }
    redirects: Route[]
    catchAllRoute: Route
    catchAllMiddleware?: Route
    dynamicRoutes: DynamicRoutes | undefined
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
    locales: string[]
  }) {
    this.basePath = basePath
    this.headers = headers
    this.fsRoutes = fsRoutes
    this.rewrites = rewrites
    this.redirects = redirects
    this.pageChecker = pageChecker
    this.catchAllRoute = catchAllRoute
    this.catchAllMiddleware = catchAllMiddleware
    this.dynamicRoutes = dynamicRoutes
    this.useFileSystemPublicRoutes = useFileSystemPublicRoutes
    this.locales = locales
    this.seenRequests = new Set()
  }

  setDynamicRoutes(routes: DynamicRoutes = []) {
    this.dynamicRoutes = routes
  }

  addFsRoute(fsRoute: Route) {
    this.fsRoutes.unshift(fsRoute)
  }

  async execute(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery
  ): Promise<boolean> {
    if (this.seenRequests.has(req)) {
      throw new Error(
        `Invariant: request has already been processed: ${req.url}, this is an internal error please open an issue.`
      )
    }
    this.seenRequests.add(req)

    // memoize page check calls so we don't duplicate checks for pages
    const pageChecks: { [name: string]: Promise<boolean> } = {}
    const memoizedPageChecker = async (p: string): Promise<boolean> => {
      p = normalizeLocalePath(p, this.locales).pathname

      if (pageChecks[p] !== undefined) {
        return pageChecks[p]
      }
      const result = this.pageChecker(p)
      pageChecks[p] = result
      return result
    }

    let parsedUrlUpdated = parsedUrl

    const applyCheckTrue = async (checkParsedUrl: NextUrlWithParsedQuery) => {
      const originalFsPathname = checkParsedUrl.pathname
      const fsPathname = replaceBasePath(originalFsPathname!, this.basePath)

      for (const fsRoute of this.fsRoutes) {
        const fsParams = fsRoute.match(fsPathname)

        if (fsParams) {
          checkParsedUrl.pathname = fsPathname

          const fsResult = await fsRoute.fn(req, res, fsParams, checkParsedUrl)

          if (fsResult.finished) {
            return true
          }

          checkParsedUrl.pathname = originalFsPathname
        }
      }
      let matchedPage = await memoizedPageChecker(fsPathname)

      // If we didn't match a page check dynamic routes
      if (!matchedPage) {
        const normalizedFsPathname = normalizeLocalePath(
          fsPathname,
          this.locales
        ).pathname

        for (const dynamicRoute of this.dynamicRoutes) {
          if (dynamicRoute.match(normalizedFsPathname)) {
            matchedPage = true
          }
        }
      }

      // Matched a page or dynamic route so render it using catchAllRoute
      if (matchedPage) {
        const pageParams = this.catchAllRoute.match(checkParsedUrl.pathname)
        checkParsedUrl.pathname = fsPathname
        checkParsedUrl.query._nextBubbleNoFallback = '1'

        const result = await this.catchAllRoute.fn(
          req,
          res,
          pageParams as Params,
          checkParsedUrl
        )
        return result.finished
      }
    }

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
      ...this.rewrites.beforeFiles,
      ...(this.useFileSystemPublicRoutes && this.catchAllMiddleware
        ? [this.catchAllMiddleware]
        : []),
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
                let { pathname } = parsedCheckerUrl
                pathname = removePathTrailingSlash(pathname || '/')

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
      ...this.rewrites.afterFiles,
      ...(this.rewrites.fallback.length
        ? [
            {
              type: 'route',
              name: 'dynamic route/page check',
              requireBasePath: false,
              match: route('/:path*'),
              fn: async (
                _checkerReq,
                _checkerRes,
                _params,
                parsedCheckerUrl
              ) => {
                return {
                  finished: await applyCheckTrue(parsedCheckerUrl),
                }
              },
            } as Route,
            ...this.rewrites.fallback,
          ]
        : []),

      // We only check the catch-all route if public page routes hasn't been
      // disabled
      ...(this.useFileSystemPublicRoutes ? [this.catchAllRoute] : []),
    ]
    const originallyHadBasePath =
      !this.basePath || getRequestMeta(req, '_nextHadBasePath')

    for (const testRoute of allRoutes) {
      // if basePath is being used, the basePath will still be included
      // in the pathname here to allow custom-routes to require containing
      // it or not, filesystem routes and pages must always include the basePath
      // if it is set
      let currentPathname = parsedUrlUpdated.pathname as string
      const originalPathname = currentPathname
      const requireBasePath = testRoute.requireBasePath !== false
      const isCustomRoute = customRouteTypes.has(testRoute.type)
      const isPublicFolderCatchall = testRoute.name === 'public folder catchall'
      const isMiddlewareCatchall = testRoute.name === 'middleware catchall'
      const keepBasePath =
        isCustomRoute || isPublicFolderCatchall || isMiddlewareCatchall
      const keepLocale = isCustomRoute

      const currentPathnameNoBasePath = replaceBasePath(
        currentPathname,
        this.basePath
      )

      if (!keepBasePath) {
        currentPathname = currentPathnameNoBasePath
      }

      const localePathResult = normalizeLocalePath(
        currentPathnameNoBasePath,
        this.locales
      )

      const activeBasePath = keepBasePath ? this.basePath : ''

      // don't match API routes when they are locale prefixed
      // e.g. /api/hello shouldn't match /en/api/hello as a page
      // rewrites/redirects can match though
      if (
        !isCustomRoute &&
        localePathResult.detectedLocale &&
        localePathResult.pathname.match(/^\/api(?:\/|$)/)
      ) {
        continue
      }

      if (keepLocale) {
        if (
          !testRoute.internal &&
          parsedUrl.query.__nextLocale &&
          !localePathResult.detectedLocale
        ) {
          currentPathname = `${activeBasePath}/${parsedUrl.query.__nextLocale}${
            currentPathnameNoBasePath === '/' ? '' : currentPathnameNoBasePath
          }`
        }

        if (
          getRequestMeta(req, '__nextHadTrailingSlash') &&
          !currentPathname.endsWith('/')
        ) {
          currentPathname += '/'
        }
      } else {
        currentPathname = `${
          getRequestMeta(req, '_nextHadBasePath') ? activeBasePath : ''
        }${
          activeBasePath && currentPathnameNoBasePath === '/'
            ? ''
            : currentPathnameNoBasePath
        }`
      }

      let newParams = testRoute.match(currentPathname)

      if (testRoute.has && newParams) {
        const hasParams = matchHas(req, testRoute.has, parsedUrlUpdated.query)

        if (hasParams) {
          Object.assign(newParams, hasParams)
        } else {
          newParams = false
        }
      }

      // Check if the match function matched
      if (newParams) {
        // since we require basePath be present for non-custom-routes we
        // 404 here when we matched an fs route
        if (!keepBasePath) {
          if (
            !originallyHadBasePath &&
            !getRequestMeta(req, '_nextDidRewrite')
          ) {
            if (requireBasePath) {
              // consider this a non-match so the 404 renders
              this.seenRequests.delete(req)
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
          this.seenRequests.delete(req)
          return true
        }

        // since the fs route didn't finish routing we need to re-add the
        // basePath to continue checking with the basePath present
        if (!keepBasePath) {
          parsedUrlUpdated.pathname = originalPathname
        }

        if (result.pathname) {
          parsedUrlUpdated.pathname = result.pathname
        }

        if (result.query) {
          parsedUrlUpdated.query = {
            ...getNextInternalQuery(parsedUrlUpdated.query),
            ...result.query,
          }
        }

        // check filesystem
        if (testRoute.check === true) {
          if (await applyCheckTrue(parsedUrlUpdated)) {
            this.seenRequests.delete(req)
            return true
          }
        }
      }
    }
    this.seenRequests.delete(req)
    return false
  }
}
