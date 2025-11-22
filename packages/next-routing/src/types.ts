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
  destination: string
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
  redirect?: {
    url: URL
    status: number
  }
  rewrite?: URL
}

export type ResolveRoutesParams = {
  url: URL
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
    beforeMiddleware: Array<Route>
    beforeFiles: Array<Route>
    afterFiles: Array<Route>
    dynamicRoutes: Array<Route>
    onMatch: Array<Route>
    fallback: Array<Route>
  }
  invokeMiddleware: (ctx: MiddlewareContext) => Promise<MiddlewareResult>
  normalizeNextData?: {
    buildId: string
  }
}

export type ResolveRoutesResult = {
  middlewareResponded?: boolean
  externalRewrite?: URL
  redirect?: {
    url: URL
    status: number
  }
  matchedPathname?: string
  resolvedHeaders?: Headers
  status?: number
  routeMatches?: Record<string, string>
}
