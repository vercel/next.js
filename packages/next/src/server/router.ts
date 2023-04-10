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
import { matchHas } from '../shared/lib/router/utils/prepare-destination'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import { getRequestMeta } from './request-meta'
import { formatNextPathnameInfo } from '../shared/lib/router/utils/format-next-pathname-info'
import { getNextPathnameInfo } from '../shared/lib/router/utils/get-next-pathname-info'
import {
  MatchOptions,
  RouteMatcherManager,
} from './future/route-matcher-managers/route-matcher-manager'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import type { I18NProvider } from './future/helpers/i18n-provider'
import { getTracer } from './lib/trace/tracer'
import { RouterSpan } from './lib/trace/constants'

type RouteResult = {
  finished: boolean
  pathname?: string
  query?: ParsedUrlQuery
}

type RouteFn = (
  req: BaseNextRequest,
  res: BaseNextResponse,
  params: Params,
  parsedUrl: NextUrlWithParsedQuery,
  upgradeHead?: Buffer
) => Promise<RouteResult> | RouteResult

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
  fn: RouteFn
}

export type RouterOptions = {
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
  matchers: RouteMatcherManager
  useFileSystemPublicRoutes: boolean
  nextConfig: NextConfig
  i18nProvider?: I18NProvider
}

export type PageChecker = (pathname: string) => Promise<boolean>

export default class Router {
  public catchAllMiddleware: ReadonlyArray<Route>

  private readonly headers: ReadonlyArray<Route>
  private readonly fsRoutes: Route[]
  private readonly redirects: ReadonlyArray<Route>
  private rewrites: {
    beforeFiles: ReadonlyArray<Route>
    afterFiles: ReadonlyArray<Route>
    fallback: ReadonlyArray<Route>
  }
  private readonly catchAllRoute: Route
  private readonly matchers: RouteMatcherManager
  private readonly useFileSystemPublicRoutes: boolean
  private readonly nextConfig: NextConfig
  private readonly i18nProvider?: I18NProvider
  private compiledRoutes: ReadonlyArray<Route>
  private needsRecompilation: boolean

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
    matchers,
    useFileSystemPublicRoutes,
    nextConfig,
    i18nProvider,
  }: RouterOptions) {
    this.nextConfig = nextConfig
    this.headers = headers
    this.fsRoutes = [...fsRoutes]
    this.rewrites = rewrites
    this.redirects = redirects
    this.catchAllRoute = catchAllRoute
    this.catchAllMiddleware = catchAllMiddleware
    this.matchers = matchers
    this.useFileSystemPublicRoutes = useFileSystemPublicRoutes
    this.i18nProvider = i18nProvider

    // Perform the initial route compilation.
    this.compiledRoutes = this.compileRoutes()
    this.needsRecompilation = false
  }

  get basePath() {
    return this.nextConfig.basePath || ''
  }

  /**
   * True when the router has catch-all middleware routes configured.
   */
  get hasMiddleware(): boolean {
    return this.catchAllMiddleware.length > 0
  }

  public setCatchallMiddleware(catchAllMiddleware: ReadonlyArray<Route>) {
    this.catchAllMiddleware = catchAllMiddleware
    this.needsRecompilation = true
  }

  public setRewrites(rewrites: RouterOptions['rewrites']) {
    this.rewrites = rewrites
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
              matchesLocale: true,
              name: 'page checker',
              match: getPathMatch('/:path*'),
              fn: async (req, res, params, parsedUrl, upgradeHead) => {
                // Next.js performs all route matching without the trailing slash.
                const pathname = removeTrailingSlash(parsedUrl.pathname || '/')

                // Normalize and detect the locale on the pathname.
                const options: MatchOptions = {
                  // We need to skip dynamic route matching because the next
                  // step we're processing the afterFiles rewrites which must
                  // not include dynamic matches.
                  skipDynamic: true,
                  i18n: this.i18nProvider?.analyze(pathname),
                }

                // If the locale was inferred from the default, we should mark
                // it in the match options.
                if (
                  options.i18n &&
                  parsedUrl.query.__nextInferredLocaleFromDefault
                ) {
                  options.i18n.inferredFromDefault = true
                }

                const match = await this.matchers.match(pathname, options)
                if (!match) return { finished: false }

                // Add the match so we can get it later.
                addRequestMeta(req, '_nextMatch', match)

                return this.catchAllRoute.fn(
                  req,
                  res,
                  params,
                  parsedUrl,
                  upgradeHead
                )
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
    ].map((route) => {
      if (route.fn) {
        return {
          ...route,
          fn: getTracer().wrap(
            RouterSpan.executeRoute,
            {
              attributes: {
                'next.route': route.name,
              },
            },
            route.fn
          ),
        }
      }
      return route
    })
  }

  private async checkFsRoutes(
    req: BaseNextRequest,
    res: BaseNextResponse,
    parsedUrl: NextUrlWithParsedQuery,
    upgradeHead?: Buffer
  ) {
    const fsPathname = removePathPrefix(parsedUrl.pathname!, this.basePath)

    for (const route of this.fsRoutes) {
      const params = route.match(fsPathname)
      if (!params) continue

      const { finished } = await route.fn(req, res, params, {
        ...parsedUrl,
        pathname: fsPathname,
      })
      if (finished) {
        return true
      }
    }

    // Normalize and detect the locale on the pathname.
    const options: MatchOptions = {
      i18n: this.i18nProvider?.analyze(fsPathname),
    }

    const match = await this.matchers.test(fsPathname, options)
    if (!match) return false

    // Matched a page or dynamic route so render it using catchAllRoute
    const params = this.catchAllRoute.match(parsedUrl.pathname)
    if (!params) {
      throw new Error(
        `Invariant: could not match params, this is an internal error please open an issue.`
      )
    }

    const { finished } = await this.catchAllRoute.fn(
      req,
      res,
      params,
      {
        ...parsedUrl,
        pathname: fsPathname,
        query: {
          ...parsedUrl.query,
          _nextBubbleNoFallback: '1',
        },
      },
      upgradeHead
    )

    return finished
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

    // Create a deep copy of the parsed URL.
    const parsedUrlUpdated = {
      ...parsedUrl,
      query: {
        ...parsedUrl.query,
      },
    }

    // when x-invoke-path is specified we can short short circuit resolving
    // we only honor this header if we are inside of a render worker to
    // prevent external users coercing the routing path
    const matchedPath = req.headers['x-invoke-path'] as string
    const curRoutes = matchedPath
      ? this.compiledRoutes.filter((r) => {
          return (
            r.name === 'Catchall render' || r.name === '_next/data catchall'
          )
        })
      : this.compiledRoutes

    if (
      process.env.NEXT_RUNTIME !== 'edge' &&
      process.env.__NEXT_PRIVATE_RENDER_WORKER &&
      matchedPath
    ) {
      const parsedMatchedPath = new URL(matchedPath || '/', 'http://n')

      const pathnameInfo = getNextPathnameInfo(parsedMatchedPath.pathname, {
        nextConfig: this.nextConfig,
        parseData: false,
      })

      if (pathnameInfo.locale) {
        parsedUrlUpdated.query.__nextLocale = pathnameInfo.locale
      }

      if (parsedUrlUpdated.pathname !== parsedMatchedPath.pathname) {
        parsedUrlUpdated.pathname = parsedMatchedPath.pathname
        addRequestMeta(req, '_nextRewroteUrl', pathnameInfo.pathname)
        addRequestMeta(req, '_nextDidRewrite', true)
      }

      for (const key of Object.keys(parsedUrlUpdated.query)) {
        if (!key.startsWith('__next') && !key.startsWith('_next')) {
          delete parsedUrlUpdated.query[key]
        }
      }
      const invokeQuery = req.headers['x-invoke-query']

      if (typeof invokeQuery === 'string') {
        Object.assign(
          parsedUrlUpdated.query,
          JSON.parse(decodeURIComponent(invokeQuery))
        )
      }
    }

    for (const route of curRoutes) {
      // only process rewrites for upgrade request
      if (upgradeHead && route.type !== 'rewrite') {
        continue
      }

      const originalPathname = parsedUrlUpdated.pathname!
      const pathnameInfo = getNextPathnameInfo(originalPathname, {
        nextConfig: this.nextConfig,
        parseData: false,
      })

      // If the request has a locale and the route is an api route that doesn't
      // support matching locales, skip the route.
      if (
        pathnameInfo.locale &&
        !route.matchesLocaleAPIRoutes &&
        isAPIRoute(pathnameInfo.pathname)
      ) {
        continue
      }

      // Restore the `basePath` if the request had a `basePath`.
      if (getRequestMeta(req, '_nextHadBasePath')) {
        pathnameInfo.basePath = this.basePath
      }

      // Create a copy of the `basePath` so we can modify it for the next
      // request if the route doesn't match with the `basePath`.
      const basePath = pathnameInfo.basePath
      if (!route.matchesBasePath) {
        pathnameInfo.basePath = undefined
      }

      // Add the locale to the information if the route supports matching
      // locales and the locale is not present in the info.
      const locale = parsedUrlUpdated.query.__nextLocale
      if (route.matchesLocale && locale && !pathnameInfo.locale) {
        pathnameInfo.locale = locale
      }

      // If the route doesn't support matching locales and the locale is the
      // default locale then remove it from the info.
      if (
        !route.matchesLocale &&
        pathnameInfo.locale === this.nextConfig.i18n?.defaultLocale &&
        pathnameInfo.locale
      ) {
        pathnameInfo.locale = undefined
      }

      // If the route doesn't support trailing slashes and the request had a
      // trailing slash then remove it from the info.
      if (
        route.matchesTrailingSlash &&
        getRequestMeta(req, '__nextHadTrailingSlash')
      ) {
        pathnameInfo.trailingSlash = true
      }

      // Construct a new pathname based on the info.
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

      // If it is a matcher that doesn't match the basePath (like the public
      // directory) but Next.js is configured to use a basePath that was
      // never there, we consider this an invalid match and keep routing.
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

        // If the result includes a pathname then we need to update the
        // parsed url pathname to continue routing.
        if (result.pathname) {
          parsedUrlUpdated.pathname = result.pathname
        } else {
          // since the fs route didn't finish routing we need to re-add the
          // basePath to continue checking with the basePath present
          parsedUrlUpdated.pathname = originalPathname
        }

        // Copy over only internal query parameters from the original query and
        // merge with the result query.
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
