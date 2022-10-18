import type { NextConfig } from './config'
import type { ParsedUrlQuery } from 'querystring'
import type { BaseNextRequest, BaseNextResponse } from './base-http'
import type {
  RouteMatch,
  Params,
} from '../shared/lib/router/utils/route-matcher'
import type { RouteHas } from '../lib/load-custom-routes'

import {
  addRequestMeta,
  getNextInternalQuery,
  NextUrlWithParsedQuery,
} from './request-meta'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
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
    parsedUrl: NextUrlWithParsedQuery,
    upgradeHead?: Buffer
  ) => Promise<RouteResult> | RouteResult
}

export type DynamicRoutes = Array<{ page: string; match: RouteMatch }>

export type PageChecker = (pathname: string) => Promise<boolean>

export default class Router {
  public catchAllMiddleware: ReadonlyArray<Route>

  private readonly headers: ReadonlyArray<Route>
  private readonly fsRoutes: Route[]
  private readonly redirects: ReadonlyArray<Route>
  private readonly rewrites: {
    beforeFiles: ReadonlyArray<Route>
    afterFiles: ReadonlyArray<Route>
    fallback: ReadonlyArray<Route>
  }
  private readonly catchAllRoute: Route
  private readonly pageChecker: PageChecker
  private dynamicRoutes: DynamicRoutes
  private readonly useFileSystemPublicRoutes: boolean
  private readonly nextConfig: NextConfig
  private compiledRoutes: ReadonlyArray<Route>
  private needsRecompilation: boolean

  /**
   * context stores information used by the router.
   */
  private readonly context = new WeakMap<
    BaseNextRequest,
    {
      /**
       * pageChecks is the memoized record of all checks made against pages to
       * help de-duplicate work.
       */
      pageChecks: Record<string, boolean>
    }
  >()

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
    headers: ReadonlyArray<Route>
    fsRoutes: ReadonlyArray<Route>
    rewrites: {
      beforeFiles: ReadonlyArray<Route>
      afterFiles: ReadonlyArray<Route>
      fallback: ReadonlyArray<Route>
    }
    redirects: ReadonlyArray<Route>
    catchAllRoute: Route
    catchAllMiddleware: ReadonlyArray<Route>
    dynamicRoutes: DynamicRoutes | undefined
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
    nextConfig: NextConfig
  }) {
    this.nextConfig = nextConfig
    this.headers = headers
    this.fsRoutes = [...fsRoutes]
    this.rewrites = rewrites
    this.redirects = redirects
    this.pageChecker = pageChecker
    this.catchAllRoute = catchAllRoute
    this.catchAllMiddleware = catchAllMiddleware
    this.dynamicRoutes = dynamicRoutes
    this.useFileSystemPublicRoutes = useFileSystemPublicRoutes

    // Perform the initial route compilation.
    this.compiledRoutes = this.compileRoutes()
    this.needsRecompilation = false
  }

  private async checkPage(
    req: BaseNextRequest,
    pathname: string
  ): Promise<boolean> {
    pathname = normalizeLocalePath(pathname, this.locales).pathname

    const context = this.context.get(req)
    if (!context) {
      throw new Error(
        'Invariant: request is not available inside the context, this is an internal error please open an issue.'
      )
    }

    if (context.pageChecks[pathname] !== undefined) {
      return context.pageChecks[pathname]
    }

    const result = await this.pageChecker(pathname)
    context.pageChecks[pathname] = result
    return result
  }

  get locales() {
    return this.nextConfig.i18n?.locales || []
  }

  get basePath() {
    return this.nextConfig.basePath || ''
  }

  public setDynamicRoutes(dynamicRoutes: DynamicRoutes) {
    this.dynamicRoutes = dynamicRoutes
    this.needsRecompilation = true
  }
  public setCatchallMiddleware(catchAllMiddleware: ReadonlyArray<Route>) {
    this.catchAllMiddleware = catchAllMiddleware
    this.needsRecompilation = true
  }

  public addFsRoute(fsRoute: Route) {
    // We use unshift so that we're sure the routes is defined before Next's
    // default routes.
    this.fsRoutes.unshift(fsRoute)
    this.needsRecompilation = true
  }

  private compileRoutes(): ReadonlyArray<Route> {
    /*
        Desired routes order
        - headers
        - redirects
        - Check filesystem (including pages), if nothing found continue
        - User rewrites (checking filesystem and pages each match)
      */

    const [middlewareCatchAllRoute] = this.catchAllMiddleware

    return [
      ...(middlewareCatchAllRoute
        ? this.fsRoutes
            .filter((route) => route.name === '_next/data catchall')
            .map((route) => ({
              ...route,
              name: '_next/data normalizing',
              check: false,
            }))
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
            {
              type: 'route',
              name: 'page checker',
              match: getPathMatch('/:path*'),
              fn: async (req, res, params, parsedUrl, upgradeHead) => {
                const pathname = removeTrailingSlash(parsedUrl.pathname || '/')
                if (!pathname) {
                  return { finished: false }
                }

                if (await this.checkPage(req, pathname)) {
                  return this.catchAllRoute.fn(
                    req,
                    res,
                    params,
                    parsedUrl,
                    upgradeHead
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
              fn: async (req, res, _params, parsedCheckerUrl, upgradeHead) => {
                return {
                  finished: await this.checkFsRoutes(
                    req,
                    res,
                    parsedCheckerUrl,
                    upgradeHead
                  ),
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
  }

  private async checkFsRoutes(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery,
    upgradeHead?: Buffer
  ) {
    const originalFsPathname = parsedUrl.pathname
    const fsPathname = removePathPrefix(originalFsPathname!, this.basePath)

    for (const route of this.fsRoutes) {
      const params = route.match(fsPathname)

      if (params) {
        parsedUrl.pathname = fsPathname

        const { finished } = await route.fn(req, res, params, parsedUrl)
        if (finished) {
          return true
        }

        parsedUrl.pathname = originalFsPathname
      }
    }

    let matchedPage = await this.checkPage(req, fsPathname)

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
      const params = this.catchAllRoute.match(parsedUrl.pathname)
      if (!params) {
        throw new Error(
          `Invariant: could not match params, this is an internal error please open an issue.`
        )
      }

      parsedUrl.pathname = fsPathname
      parsedUrl.query._nextBubbleNoFallback = '1'

      const { finished } = await this.catchAllRoute.fn(
        req,
        res,
        params,
        parsedUrl,
        upgradeHead
      )

      return finished
    }

    return false
  }

  async execute(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery,
    upgradeHead?: Buffer
  ): Promise<boolean> {
    // Only recompile if the routes need to be recompiled, this should only
    // happen in development.
    if (this.needsRecompilation) {
      this.compiledRoutes = this.compileRoutes()
      this.needsRecompilation = false
    }

    if (this.context.has(req)) {
      throw new Error(
        `Invariant: request has already been processed: ${req.url}, this is an internal error please open an issue.`
      )
    }
    this.context.set(req, { pageChecks: {} })

    try {
      // Create a deep copy of the parsed URL.
      const parsedUrlUpdated = {
        ...parsedUrl,
        query: {
          ...parsedUrl.query,
        },
      }

      for (const route of this.compiledRoutes) {
        // only process rewrites for upgrade request
        if (upgradeHead && route.type !== 'rewrite') {
          continue
        }

        const originalPathname = parsedUrlUpdated.pathname as string
        const pathnameInfo = getNextPathnameInfo(originalPathname, {
          nextConfig: this.nextConfig,
          parseData: false,
        })

        if (
          pathnameInfo.locale &&
          !route.matchesLocaleAPIRoutes &&
          pathnameInfo.pathname.match(/^\/api(?:\/|$)/)
        ) {
          continue
        }

        if (getRequestMeta(req, '_nextHadBasePath')) {
          pathnameInfo.basePath = this.basePath
        }

        const basePath = pathnameInfo.basePath
        if (!route.matchesBasePath) {
          pathnameInfo.basePath = ''
        }

        if (
          route.matchesLocale &&
          parsedUrlUpdated.query.__nextLocale &&
          !pathnameInfo.locale
        ) {
          pathnameInfo.locale = parsedUrlUpdated.query.__nextLocale
        }

        if (
          !route.matchesLocale &&
          pathnameInfo.locale === this.nextConfig.i18n?.defaultLocale &&
          pathnameInfo.locale
        ) {
          pathnameInfo.locale = undefined
        }

        if (
          route.matchesTrailingSlash &&
          getRequestMeta(req, '__nextHadTrailingSlash')
        ) {
          pathnameInfo.trailingSlash = true
        }

        const matchPathname = formatNextPathnameInfo({
          ignorePrefix: true,
          ...pathnameInfo,
        })

        let params = route.match(matchPathname)
        if (route.has && params) {
          const hasParams = matchHas(req, route.has, parsedUrlUpdated.query)
          if (hasParams) {
            Object.assign(params, hasParams)
          } else {
            params = false
          }
        }

        /**
         * If it is a matcher that doesn't match the basePath (like the public
         * directory) but Next.js is configured to use a basePath that was
         * never there, we consider this an invalid match and keep routing.
         */
        if (
          params &&
          this.basePath &&
          !route.matchesBasePath &&
          !getRequestMeta(req, '_nextDidRewrite') &&
          !basePath
        ) {
          continue
        }

        if (params) {
          const isNextDataNormalizing = route.name === '_next/data normalizing'

          if (isNextDataNormalizing) {
            addRequestMeta(req, '_nextDataNormalizing', true)
          }
          parsedUrlUpdated.pathname = matchPathname
          const result = await route.fn(
            req,
            res,
            params,
            parsedUrlUpdated,
            upgradeHead
          )

          if (isNextDataNormalizing) {
            addRequestMeta(req, '_nextDataNormalizing', false)
          }
          if (result.finished) {
            return true
          }

          if (result.pathname) {
            parsedUrlUpdated.pathname = result.pathname
          } else {
            // since the fs route didn't finish routing we need to re-add the
            // basePath to continue checking with the basePath present
            parsedUrlUpdated.pathname = originalPathname
          }

          if (result.query) {
            parsedUrlUpdated.query = {
              ...getNextInternalQuery(parsedUrlUpdated.query),
              ...result.query,
            }
          }

          // check filesystem
          if (
            route.check &&
            (await this.checkFsRoutes(req, res, parsedUrlUpdated))
          ) {
            return true
          }
        }
      }

      // All routes were tested, none were found.
      return false
    } finally {
      this.context.delete(req)
    }
  }
}
