import type { NextConfig } from './config'
import type { ParsedUrlQuery } from 'querystring'
import type { BaseNextRequest, BaseNextResponse } from './base-http'
import type {
  RouteMatchFn,
  Params,
} from '../shared/lib/router/utils/route-matcher'
import type { RouteHas } from '../lib/load-custom-routes'

import {
  addRequestMeta,
  getNextInternalQuery,
  NextUrlWithParsedQuery,
} from './request-meta'
import { isAPIRoute } from '../lib/is-api-route'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { matchHas } from '../shared/lib/router/utils/prepare-destination'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import { getRequestMeta } from './request-meta'
import { formatNextPathnameInfo } from '../shared/lib/router/utils/format-next-pathname-info'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'

export enum RouteResultState {
  /**
   * FINISHED indicates that the route resolution was completed and the response
   * has been sent to the client.
   */
  FINISHED,

  /**
   * CONTINUE indicates that the route resolution was not completed, and should
   * continue.
   */
  CONTINUE,

  /**
   * REWIND indicates that the resolution of the routes requires that the
   * resolution for routes should go back a step, allowing the current route to
   * be re-ran. This is a special case just for custom route handler rewrites.
   */
  REWIND,
}

export type RouteResult = {
  state: RouteResultState
  pathname?: string
  query?: ParsedUrlQuery
}

export type Route = {
  match: RouteMatchFn
  has?: RouteHas[]
  missing?: RouteHas[]
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

// TODO: document
export type DynamicRoutes = Array<{
  page: string
  match: RouteMatchFn
}>

export type PageChecker = (pathname: string) => Promise<boolean>

export interface Routes {
  headers?: ReadonlyArray<Route>
  fs: Array<Route>
  redirects?: ReadonlyArray<Route>
  rewrites?: {
    beforeFiles?: ReadonlyArray<Route>
    afterFiles?: ReadonlyArray<Route>
    fallback?: ReadonlyArray<Route>
  }
  catchAll: Route
  catchAllMiddleware?: ReadonlyArray<Route>
  dynamic?: DynamicRoutes
}

export interface RouterOptions {
  routes: Routes
  nextConfig: NextConfig
  pageChecker: PageChecker
  useFileSystemPublicRoutes: boolean
}

export default class Router {
  private readonly routes: Routes
  private readonly pageChecker: PageChecker
  private readonly useFileSystemPublicRoutes: boolean
  private readonly nextConfig: NextConfig

  /**
   * List of compiled routes, automatically recompiled when required during
   * route execution.
   */
  private compiled: ReadonlyArray<Route>
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
    routes,
    nextConfig,
    pageChecker,
    useFileSystemPublicRoutes,
  }: RouterOptions) {
    this.routes = routes
    this.nextConfig = nextConfig
    this.pageChecker = pageChecker
    this.useFileSystemPublicRoutes = useFileSystemPublicRoutes

    // Perform the initial route compilation.
    this.compiled = this.compile()
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

  /**
   * Returns true if the router has catch all middleware.
   */
  public get hasCatchAllMiddleware() {
    if (!this.routes.catchAllMiddleware) return false

    return this.routes.catchAllMiddleware.length > 0
  }

  public setDynamicRoutes(dynamic: DynamicRoutes) {
    this.routes.dynamic = dynamic
  }

  public setCatchallMiddleware(catchAllMiddleware: ReadonlyArray<Route>) {
    this.routes.catchAllMiddleware = catchAllMiddleware
    this.needsRecompilation = true
  }

  public addFsRoute(fsRoute: Route) {
    // We use unshift so that we're sure the routes is defined before Next's
    // default routes.
    this.routes.fs.unshift(fsRoute)
    this.needsRecompilation = true
  }

  private get locales() {
    return this.nextConfig.i18n?.locales || []
  }

  private get basePath() {
    return this.nextConfig.basePath || ''
  }

  private compile(): ReadonlyArray<Route> {
    return [
      ...this.normalizingNextDataCatchAllRoutes,
      // Apply and parse headers to the response.
      ...(this.routes.headers ?? []),
      // Apply all the redirects.
      ...(this.routes.redirects ?? []),
      // If we should use filesystem public routes then add the catch all
      // middleware.
      ...(this.useFileSystemPublicRoutes
        ? this.routes.catchAllMiddleware ?? []
        : []),
      ...(this.routes.rewrites?.beforeFiles ?? []),
      // Check the filesystem for any matches, then check the pages for any
      // matches.
      ...this.routes.fs,
      ...(this.useFileSystemPublicRoutes ? [this.pageCheckerRoute] : []),
      // Check for any user rewrites.
      ...(this.routes.rewrites?.afterFiles ?? []),
      // If fallback rewrites are configured, check the fs routes first.
      ...(this.routes.rewrites?.fallback &&
      this.routes.rewrites.fallback.length > 0
        ? [this.dynamicFsRoutePageCheckRoute, ...this.routes.rewrites.fallback]
        : []),
      // We only check the catch-all route if public page routes hasn't been
      // disabled
      ...(this.useFileSystemPublicRoutes ? [this.routes.catchAll] : []),
    ]
  }

  private readonly dynamicFsRoutePageCheckRoute: Route = {
    type: 'route',
    name: 'dynamic fs route/page check',
    match: getPathMatch('/:path*'),
    fn: async (req, res, _params, parsedCheckerUrl, upgradeHead) =>
      await this.checkFsRoutes(req, res, parsedCheckerUrl, upgradeHead),
  }

  private pageCheckerRoute: Route = {
    type: 'route',
    name: 'page checker',
    match: getPathMatch('/:path*'),
    fn: async (req, res, params, parsedUrl, upgradeHead) => {
      const pathname = removeTrailingSlash(parsedUrl.pathname || '/')
      if (!pathname) {
        return { state: RouteResultState.CONTINUE }
      }

      if (await this.checkPage(req, pathname)) {
        return this.routes.catchAll.fn(req, res, params, parsedUrl, upgradeHead)
      }

      return { state: RouteResultState.CONTINUE }
    },
  }

  private get normalizingNextDataCatchAllRoutes(): ReadonlyArray<Route> {
    if (!this.hasCatchAllMiddleware) return []

    return this.routes.fs
      .filter((route) => route.name === '_next/data catchall')
      .map((route) => ({
        ...route,
        name: '_next/data normalizing',
        check: false,
      }))
  }

  private async checkFsRoutes(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery,
    upgradeHead?: Buffer
  ): Promise<RouteResult> {
    const originalFsPathname = parsedUrl.pathname
    const fsPathname = removePathPrefix(originalFsPathname!, this.basePath)

    for (const route of this.routes.fs) {
      const params = route.match(fsPathname)
      if (!params) continue

      parsedUrl.pathname = fsPathname

      const { state } = await route.fn(req, res, params, parsedUrl)
      if (state === RouteResultState.FINISHED) return { state }

      parsedUrl.pathname = originalFsPathname
    }

    let matchedPage = await this.checkPage(req, fsPathname)

    // If we didn't match a page check dynamic routes
    if (!matchedPage && this.routes.dynamic) {
      const { pathname: normalizedFsPathname } = normalizeLocalePath(
        fsPathname,
        this.locales
      )

      for (const dynamicRoute of this.routes.dynamic) {
        if (!dynamicRoute.match(normalizedFsPathname)) continue

        matchedPage = true
        break
      }
    }

    if (!matchedPage) return { state: RouteResultState.CONTINUE }

    // Matched a page or dynamic route so render it using catchAllRoute
    const params = this.routes.catchAll.match(parsedUrl.pathname)
    if (!params) {
      throw new Error(
        `Invariant: could not match params, this is an internal error please open an issue.`
      )
    }

    parsedUrl.pathname = fsPathname
    parsedUrl.query._nextBubbleNoFallback = '1'

    return await this.routes.catchAll.fn(
      req,
      res,
      params,
      parsedUrl,
      upgradeHead
    )
  }

  public async execute(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: Readonly<NextUrlWithParsedQuery>,
    upgradeHead?: Buffer
  ): Promise<boolean> {
    // Only recompile if the routes need to be recompiled, this should only
    // happen in development as routes are only added at a later point in the
    // runtime in those environments.
    if (this.needsRecompilation) {
      this.compiled = this.compile()
      this.needsRecompilation = false
    }

    // Add the request to the context so we can track the page checks per
    // request. Expect that this is only done once per request (or error).
    if (this.context.has(req)) {
      throw new Error(
        `Invariant: request has already been processed: ${req.url}, this is an internal error please open an issue.`
      )
    }
    this.context.set(req, { pageChecks: {} })

    try {
      // Create a deep copy of the parsed URL.
      const parsedUrlUpdated: NextUrlWithParsedQuery = {
        ...parsedUrl,
        query: {
          ...parsedUrl.query,
        },
      }

      /**
       * In order to support rewrites from the custom app routes, the routes
       * must be re-run to allow existing routes to be hit again (so it can be
       * rewritten) in the Node.js runtime. This guards that behavior to ensure
       * it is only done once.
       */
      let hasRewoundRoutes = false

      for (
        let routeIndex = 0;
        routeIndex < this.compiled.length;
        routeIndex++
      ) {
        const route = this.compiled[routeIndex]

        // Only process rewrites for upgrade request.
        if (upgradeHead && route.type !== 'rewrite') continue

        const originalPathname = parsedUrlUpdated.pathname!
        const pathnameInfo = getNextPathnameInfo(originalPathname, {
          nextConfig: this.nextConfig,
          parseData: false,
        })

        // If this pathname contains locale information, this route indicates it
        // does not match for locale aware api routes, and this is an api route,
        // skip it!
        if (
          pathnameInfo.locale &&
          !route.matchesLocaleAPIRoutes &&
          isAPIRoute(pathnameInfo.pathname)
        ) {
          continue
        }

        // Update the base path on the pathname.
        if (getRequestMeta(req, '_nextHadBasePath')) {
          pathnameInfo.basePath = this.basePath
        }

        const { basePath } = pathnameInfo

        // If the route is not base path aware, unset the base path.
        if (!route.matchesBasePath) pathnameInfo.basePath = ''

        if (
          route.matchesLocale &&
          !pathnameInfo.locale &&
          parsedUrlUpdated.query.__nextLocale
        ) {
          pathnameInfo.locale = parsedUrlUpdated.query.__nextLocale
        } else if (
          !route.matchesLocale &&
          pathnameInfo.locale &&
          pathnameInfo.locale === this.nextConfig.i18n?.defaultLocale
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
        if ((route.has || route.missing) && params) {
          const hasParams = matchHas(
            req,
            parsedUrlUpdated.query,
            route.has,
            route.missing
          )
          if (hasParams) {
            Object.assign(params, hasParams)
          } else {
            params = false
          }
        }

        if (!params) continue

        // If it is a matcher that doesn't match the basePath (like the public
        // directory) but Next.js is configured to use a basePath that was
        // never there, we consider this an invalid match and keep routing.
        if (
          this.basePath &&
          !route.matchesBasePath &&
          !getRequestMeta(req, '_nextDidRewrite') &&
          !basePath
        ) {
          continue
        }

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

        if (result.state === RouteResultState.FINISHED) return true

        if (result.pathname) {
          parsedUrlUpdated.pathname = result.pathname
        } else {
          // since the fs route didn't finish routing we need to re-add the
          // basePath to continue checking with the basePath present
          parsedUrlUpdated.pathname = originalPathname
        }

        // Merge in the query from the route if it exists.
        if (result.query) {
          parsedUrlUpdated.query = {
            ...getNextInternalQuery(parsedUrlUpdated.query),
            ...result.query,
          }
        }

        // Check filesystem routes.
        if (
          route.check &&
          (await this.checkFsRoutes(req, res, parsedUrlUpdated))
        ) {
          return true
        }

        // If this is the Catch-all route, and the result requested to be
        // rewritten, then rewind the route once.
        if (
          route.name === 'Catchall render' &&
          result.state === RouteResultState.REWIND &&
          !hasRewoundRoutes
        ) {
          hasRewoundRoutes = true
          routeIndex -= 1
        }
      }

      // All routes were tested, none were found.
      return false
    } finally {
      this.context.delete(req)
    }
  }
}

let _makeResolver: any = () => {}

if (
  // ensure this isn't bundled for edge runtime
  process.env.NEXT_RUNTIME !== 'edge' &&
  // only load if we are inside of the turbopack handler
  process.argv.some((arg) => arg.endsWith('router.js'))
) {
  _makeResolver = require('./lib/route-resolver').makeResolver
}

export const makeResolver = _makeResolver
