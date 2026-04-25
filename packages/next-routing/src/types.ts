export type RouteHas =
  | {
      type: 'header' | 'cookie' | 'query'
      key: string
      value?: string
    }
  | {
      type: 'host'
      key?: undefined
      value: string
    }

export type Route = {
  // regex as string can have named or un-named matches
  sourceRegex: string
  // destination can have matches to replace in destination
  // keyed by $1 for un-named and $name for named
  destination?: string
  headers?: Record<string, string>
  has?: RouteHas[]
  missing?: RouteHas[]
  status?: number
}

export type MiddlewareContext = {
  url: URL
  headers: Headers
  requestBody: ReadableStream
}

export type MiddlewareResult = {
  bodySent?: boolean
  requestHeaders?: Headers
  responseHeaders?: Headers
  redirect?: {
    url: URL
    status: number
  }
  rewrite?: URL
}

export type ResolveRoutesParams = {
  url: URL
  buildId: string
  basePath: string
  requestBody: ReadableStream
  headers: Headers
  pathnames: string[]
  i18n?: {
    defaultLocale: string
    domains?: Array<{
      defaultLocale: string
      domain: string
      http?: true
      locales?: string[]
    }>
    localeDetection?: false
    locales: string[]
  }
  routes: {
    /**
     * When false (default), route matching is case-insensitive to mirror
     * Next.js default behavior. When true, matches are case-sensitive.
     */
    caseSensitive?: boolean
    beforeMiddleware: Array<Route>
    /**
     * Middleware matcher definitions used to decide whether middleware should
     * be invoked for the current request.
     */
    middlewareMatchers?: Array<Route>
    beforeFiles: Array<Route>
    afterFiles: Array<Route>
    dynamicRoutes: Array<Route>
    onMatch: Array<Route>
    fallback: Array<Route>
    shouldNormalizeNextData?: boolean
  }
  invokeMiddleware: (ctx: MiddlewareContext) => Promise<MiddlewareResult>
}

export type ResolveRoutesQueryValue = string | string[]
export type ResolveRoutesQuery = Record<string, ResolveRoutesQueryValue>

export type RouteInvocationTarget = {
  /**
   * Concrete pathname that should be invoked after routing resolution.
   */
  pathname: string
  /**
   * Concrete query that should be invoked after routing resolution.
   */
  query: ResolveRoutesQuery
}

export type ResolveRoutesResult = {
  middlewareResponded?: boolean
  externalRewrite?: URL
  redirect?: {
    url: URL
    status: number
  }
  /**
   * Resolved pathname selected by route matching. For dynamic routes this is
   * the matched template pathname.
   */
  resolvedPathname?: string
  /**
   * Merged query produced by rewrite/middleware routing.
   */
  resolvedQuery?: ResolveRoutesQuery
  /**
   * Concrete invocation target to use when invoking the resolved route/module.
   */
  invocationTarget?: RouteInvocationTarget
  resolvedHeaders?: Headers
  status?: number
  routeMatches?: Record<string, string>
}
