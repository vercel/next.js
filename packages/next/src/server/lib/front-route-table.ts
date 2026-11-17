import { STATUS_CODES } from 'http'
import { RouteKind } from '../route-kind'

/**
 * The route table Node sends next-front (src/server/front/routing). It tells
 * the front which requests it may send straight to a route.go worker. The
 * front goes direct only when Node would have passed the request to that
 * worker unchanged; everything else still goes to Node.
 *
 * An app gets an empty table (a `reason`) when anything Node runs before
 * matching a route could apply: proxy.ts or proxy.go, `next.config` headers,
 * redirects or rewrites, i18n, or an instrumentation hook, whose tracing
 * direct requests would skip.
 */
export type FrontRouteTable =
  | Readonly<{ contract: { version: 1 }; reason: string }>
  | Readonly<{
      contract: { version: 1 }
      basePath: string
      maxHeaderBytes: number
      compress: boolean
      nodePrefixes: readonly string[]
      nodeRequestHeaders: readonly string[]
      nodeExact: readonly string[]
      goExact: Readonly<Record<string, string>>
      dynamic: ReadonlyArray<{ path: readonly PatternEntry[]; go?: string }>
      /**
       * How the front sends a direct request and its response, for the
       * host's HTTP code. The routing package reads only the fields above.
       */
      direct: Readonly<{
        stripRequestHeaders: readonly string[]
        stripRequestHeaderPrefixes: readonly string[]
        statusText: Readonly<Record<string, string>>
        /**
         * When a worker fails before answering a direct request, the front
         * hands the request to Node with this header, and Node answers with
         * its error page, as it does when its own call to the worker fails.
         */
        workerFailedHeader: Readonly<{ name: string; value: string }>
      }>
    }>

/** One segment of a route pattern, as in the router contract spec (9.1). */
export type PatternEntry =
  | string
  | Readonly<{ param: string }>
  | Readonly<{ rest: string; min: 0 | 1 }>

export type FrontRouteTableInput = Readonly<{
  goRoutes: boolean
  basePath: string
  hasI18n: boolean
  trailingSlash: boolean
  compress: boolean
  useFileSystemPublicRoutes: boolean
  hasMiddleware: boolean
  hasInstrumentation: boolean
  /** NEXT_PRIVATE_TEST_HEADERS: Node keeps internal headers then. */
  keepsInternalHeaders: boolean
  headers: readonly unknown[]
  onMatchHeaders: ReadonlyArray<{
    source: string
    has?: ReadonlyArray<{ type: string; key?: string }>
  }>
  redirects: ReadonlyArray<{ internal?: boolean }>
  beforeFilesRewrites: readonly unknown[]
  afterFilesRewrites: readonly unknown[]
  /** Paths without basePath, as the router's file lookup keeps them. */
  publicFiles: Iterable<string>
  appFiles: Iterable<string>
  pageFiles: Iterable<string>
  /** Dynamic routes in the router's order. */
  dynamicRoutes: ReadonlyArray<{ page: string; dataRouteRegex?: string }>
  /** The app route registered for a pathname, as the router knows it. */
  appRoute: (pathname: string) => { kind: RouteKind; page: string } | undefined
  internalHeaders: readonly string[]
  maxHeaderBytes: number
  workerFailedHeader: Readonly<{ name: string; value: string }>
}>

const VERSION = 1

export function frontRouteTable(input: FrontRouteTableInput): FrontRouteTable {
  const reason = ineligibleReason(input)
  if (reason) return { contract: { version: VERSION }, reason }

  // Headers added when a rule matches (a deploymentId adds two). One that
  // only applies under /_next/ never meets a direct request; one that
  // depends on a request header sends requests with that header to Node.
  const nodeRequestHeaders = new Set<string>()
  for (const rule of input.onMatchHeaders) {
    const source = rule.source.startsWith(input.basePath + '/')
      ? rule.source.slice(input.basePath.length)
      : rule.source
    if (source.startsWith('/_next/')) continue
    const header = rule.has?.find((condition) => condition.type === 'header')
    if (!header?.key) {
      return { contract: { version: VERSION }, reason: 'headers' }
    }
    nodeRequestHeaders.add(header.key.toLowerCase())
  }

  const nodeExact = new Set<string>([...input.publicFiles, ...input.pageFiles])
  const goExact: Record<string, string> = {}
  for (const pathname of input.appFiles) {
    const route = input.appRoute(pathname)
    if (route?.kind === RouteKind.APP_ROUTE_GO) goExact[pathname] = route.page
    else nodeExact.add(pathname)
  }

  const dynamic: Array<{ path: readonly PatternEntry[]; go?: string }> = []
  for (const route of input.dynamicRoutes) {
    // Pages data routes only match /_next/data/..., which always goes to Node.
    if (route.dataRouteRegex) continue
    const path = patternOf(route.page)
    if (!path) {
      return {
        contract: { version: VERSION },
        reason: `unsupported route pattern ${route.page}`,
      }
    }
    const app = input.appRoute(route.page)
    dynamic.push(
      app?.kind === RouteKind.APP_ROUTE_GO ? { path, go: app.page } : { path }
    )
  }

  if (Object.keys(goExact).length === 0 && !dynamic.some((route) => route.go)) {
    return { contract: { version: VERSION }, reason: 'no route.go routes' }
  }

  const statusText: Record<string, string> = {}
  for (const [code, text] of Object.entries(STATUS_CODES)) {
    if (text) statusText[code] = text
  }

  return {
    contract: { version: VERSION },
    basePath: input.basePath,
    maxHeaderBytes: input.maxHeaderBytes,
    compress: input.compress,
    // Next.js's own files, and the legacy static/ folder, whose contents the
    // table doesn't list.
    nodePrefixes: ['/_next/', '/static/'],
    nodeRequestHeaders: [...nodeRequestHeaders],
    nodeExact: [...nodeExact].sort(),
    goExact,
    dynamic,
    direct: {
      stripRequestHeaders: [...input.internalHeaders],
      stripRequestHeaderPrefixes: ['x-next-internal-'],
      statusText,
      workerFailedHeader: input.workerFailedHeader,
    },
  }
}

function ineligibleReason(input: FrontRouteTableInput): string | undefined {
  if (!input.goRoutes) return 'experimental.goRoutes is off'
  if (input.hasMiddleware) return 'proxy'
  if (input.hasInstrumentation) return 'instrumentation'
  if (input.hasI18n) return 'i18n'
  if (input.keepsInternalHeaders) return 'NEXT_PRIVATE_TEST_HEADERS'
  if (!input.useFileSystemPublicRoutes) return 'useFileSystemPublicRoutes'
  if (input.headers.length) return 'headers'
  if (input.beforeFilesRewrites.length || input.afterFilesRewrites.length) {
    return 'rewrites'
  }
  // With trailingSlash: false, Next adds its own redirects that remove a
  // trailing slash; the front sends every path ending in "/" to Node.
  if (input.trailingSlash) return 'trailingSlash'
  if (input.redirects.some((redirect) => !redirect.internal)) {
    return 'redirects'
  }
  return undefined
}

/**
 * Turns a route's page path into a segment list, or undefined when a segment
 * isn't one of the forms file-system routes use.
 */
export function patternOf(page: string): PatternEntry[] | undefined {
  const segments = page.split('/').slice(1)
  if (segments.length === 1 && segments[0] === '') return []
  const path: PatternEntry[] = []
  for (const [i, segment] of segments.entries()) {
    const last = i === segments.length - 1
    let match: RegExpExecArray | null
    if ((match = /^\[\[\.\.\.([^[\]]+)\]\]$/.exec(segment)) && last) {
      path.push({ rest: match[1], min: 0 })
    } else if ((match = /^\[\.\.\.([^[\]]+)\]$/.exec(segment)) && last) {
      path.push({ rest: match[1], min: 1 })
    } else if ((match = /^\[([^[\].]+)\]$/.exec(segment))) {
      path.push({ param: match[1] })
    } else if (segment !== '' && !/[[\]]/.test(segment)) {
      path.push(segment)
    } else {
      return undefined
    }
  }
  return path
}
