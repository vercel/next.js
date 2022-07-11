import type { NextConfig } from './config'
import type { ParsedUrlQuery } from 'querystring'
import type { BaseNextRequest, BaseNextResponse } from './base-http'
import type {
  RouteMatch,
  Params,
} from '../shared/lib/router/utils/route-matcher'

import { getNextInternalQuery, NextUrlWithParsedQuery } from './request-meta'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { RouteHas } from '../lib/load-custom-routes'
import { matchHas } from '../shared/lib/router/utils/prepare-destination'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import { getRequestMeta } from './request-meta'
import { formatNextPathnameInfo } from '../shared/lib/router/utils/format-next-pathname-info'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'

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
  matchesBasePath?: true
  matchesLocale?: true
  matchesLocaleAPIRoutes?: true
  matchesTrailingSlash?: true
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

export default class Router {
  headers: Route[]
  fsRoutes: Route[]
  redirects: Route[]
  rewrites: {
    beforeFiles: Route[]
    afterFiles: Route[]
    fallback: Route[]
  }
  catchAllRoute: Route
  catchAllMiddleware: Route[]
  pageChecker: PageChecker
  dynamicRoutes: DynamicRoutes
  useFileSystemPublicRoutes: boolean
  seenRequests: Set<any>
  nextConfig: NextConfig

  constructor({
    headers = [],
    fsRoutes = [],
    rewrites = {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    },
    redirects = [],
    catchAllRoute,
    catchAllMiddleware = [],
    dynamicRoutes = [],
    pageChecker,
    useFileSystemPublicRoutes,
    nextConfig,
  }: {
    headers: Route[]
    fsRoutes: Route[]
    rewrites: {
      beforeFiles: Route[]
      afterFiles: Route[]
      fallback: Route[]
    }
    redirects: Route[]
    catchAllRoute: Route
    catchAllMiddleware: Route[]
    dynamicRoutes: DynamicRoutes | undefined
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
    nextConfig: NextConfig
  }) {
    this.nextConfig = nextConfig
    this.headers = headers
    this.fsRoutes = fsRoutes
    this.rewrites = rewrites
    this.redirects = redirects
    this.pageChecker = pageChecker
    this.catchAllRoute = catchAllRoute
    this.catchAllMiddleware = catchAllMiddleware
    this.dynamicRoutes = dynamicRoutes
    this.useFileSystemPublicRoutes = useFileSystemPublicRoutes
    this.seenRequests = new Set()
  }

  get locales() {
    return this.nextConfig.i18n?.locales || []
  }

  get basePath() {
    return this.nextConfig.basePath || ''
  }

  setDynamicRoutes(routes: DynamicRoutes = []) {
    this.dynamicRoutes = routes
  }
  setCatchallMiddleware(route?: Route[]) {
    this.catchAllMiddleware = route || []
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
    try {
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
        const fsPathname = removePathPrefix(originalFsPathname!, this.basePath)

        for (const fsRoute of this.fsRoutes) {
          const fsParams = fsRoute.match(fsPathname)

          if (fsParams) {
            checkParsedUrl.pathname = fsPathname

            const fsResult = await fsRoute.fn(
              req,
              res,
              fsParams,
              checkParsedUrl
            )

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

      const [middlewareCatchAllRoute, edgeSSRCatchAllRoute] =
        this.catchAllMiddleware
      const allRoutes = [
        ...(middlewareCatchAllRoute
          ? this.fsRoutes.filter((r) => r.name === '_next/data catchall')
          : []),
        ...this.headers,
        ...this.redirects,
        ...(this.useFileSystemPublicRoutes && middlewareCatchAllRoute
          ? [middlewareCatchAllRoute]
          : []),
        ...this.rewrites.beforeFiles,
        ...this.fsRoutes,
        // We only check the catch-all route if public page routes hasn't been
        // disabled
        ...(this.useFileSystemPublicRoutes
          ? [
              ...(edgeSSRCatchAllRoute ? [edgeSSRCatchAllRoute] : []),
              {
                type: 'route',
                name: 'page checker',
                match: getPathMatch('/:path*'),
                fn: async (
                  checkerReq,
                  checkerRes,
                  params,
                  parsedCheckerUrl
                ) => {
                  let { pathname } = parsedCheckerUrl
                  pathname = removeTrailingSlash(pathname || '/')

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
                match: getPathMatch('/:path*'),
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
        ...(this.useFileSystemPublicRoutes
          ? [
              ...(edgeSSRCatchAllRoute ? [edgeSSRCatchAllRoute] : []),
              this.catchAllRoute,
            ]
          : []),
      ]

      for (const testRoute of allRoutes) {
        const originalPathname = parsedUrlUpdated.pathname as string
        const pathnameInfo = getNextPathnameInfo(originalPathname, {
          nextConfig: this.nextConfig,
          parseData: false,
        })

        if (
          pathnameInfo.locale &&
          !testRoute.matchesLocaleAPIRoutes &&
          pathnameInfo.pathname.match(/^\/api(?:\/|$)/)
        ) {
          continue
        }

        if (getRequestMeta(req, '_nextHadBasePath')) {
          pathnameInfo.basePath = this.basePath
        }

        const basePath = pathnameInfo.basePath
        if (!testRoute.matchesBasePath) {
          pathnameInfo.basePath = ''
        }

        if (
          testRoute.matchesLocale &&
          parsedUrl.query.__nextLocale &&
          !pathnameInfo.locale
        ) {
          pathnameInfo.locale = parsedUrl.query.__nextLocale
        }

        if (
          !testRoute.matchesLocale &&
          pathnameInfo.locale === this.nextConfig.i18n?.defaultLocale &&
          pathnameInfo.locale
        ) {
          pathnameInfo.locale = undefined
        }

        if (
          testRoute.matchesTrailingSlash &&
          getRequestMeta(req, '__nextHadTrailingSlash')
        ) {
          pathnameInfo.trailingSlash = true
        }

        const matchPathname = formatNextPathnameInfo({
          ignorePrefix: true,
          ...pathnameInfo,
        })

        let newParams = testRoute.match(matchPathname)
        if (testRoute.has && newParams) {
          const hasParams = matchHas(req, testRoute.has, parsedUrlUpdated.query)
          if (hasParams) {
            Object.assign(newParams, hasParams)
          } else {
            newParams = false
          }
        }

        /**
         * If it is a matcher that doesn't match the basePath (like the public
         * directory) but Next.js is configured to use a basePath that was
         * never there, we consider this an invalid match and keep routing.
         */
        if (
          newParams &&
          this.basePath &&
          !testRoute.matchesBasePath &&
          !getRequestMeta(req, '_nextDidRewrite') &&
          !basePath
        ) {
          continue
        }

        if (newParams) {
          parsedUrlUpdated.pathname = matchPathname
          const result = await testRoute.fn(
            req,
            res,
            newParams,
            parsedUrlUpdated
          )

          if (result.finished) {
            return true
          }

          // since the fs route didn't finish routing we need to re-add the
          // basePath to continue checking with the basePath present
          parsedUrlUpdated.pathname = originalPathname

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
              return true
            }
          }
        }
      }
      return false
    } finally {
      this.seenRequests.delete(req)
    }
  }
}
