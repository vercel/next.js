import fs from 'fs'
import http from 'http'
import path from 'path'
import type { NextConfigComplete, NextConfigRuntime } from '../config-shared'
import type { setupFsCheck } from './router-utils/filesystem'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../lib/constants'
import { INTERNAL_HEADERS } from './server-ipc/utils'
import { SWITCHYARD_DIRECT_ENV } from './switchyard-env'
import { RouteKind } from '../route-kind'
import { getSegmentParam } from '../../shared/lib/router/utils/get-segment-param'
import { INTERCEPTION_ROUTE_MARKERS } from '../../shared/lib/router/utils/interception-routes'

/**
 * The route table Node sends Switchyard (src/server/switchyard/routing). It
 * tells Switchyard which requests it may send straight to a route.go worker.
 * Switchyard goes direct only when Node would have passed the request to that
 * worker unchanged; everything else still goes to Node.
 *
 * An app gets an empty table (a `reason`) when anything Node runs before
 * matching a route could apply: proxy.ts or proxy.go, `next.config` headers,
 * redirects or rewrites, i18n, or an instrumentation hook, whose tracing
 * direct requests would skip.
 */
export type SwitchyardRouteTable =
  | Readonly<{ contract: { version: 1 }; reason: string }>
  | Readonly<{
      contract: { version: 1 }
      maxHeaderBytes: number
      compress: boolean
      nodePrefixes: readonly string[]
      nodeRequestHeaders: readonly string[]
      nodeExact: readonly string[]
      goExact: Readonly<Record<string, string>>
      dynamic: ReadonlyArray<{ path: readonly PatternEntry[]; go?: string }>
      /**
       * How Switchyard sends a direct request and its response, for the
       * host's HTTP code. The routing package reads only the fields above.
       */
      direct: Readonly<{
        stripRequestHeaders: readonly string[]
        stripRequestHeaderPrefixes: readonly string[]
      }>
    }>

/** One segment of a route pattern, as in the router contract spec (9.1). */
export type PatternEntry =
  | string
  | Readonly<{ param: string }>
  | Readonly<{ rest: string; min: 0 | 1 }>

export type SwitchyardRouteTableInput = Readonly<{
  goRoutes: boolean
  basePath: string
  hasI18n: boolean
  trailingSlash: boolean
  compress: boolean
  useFileSystemPublicRoutes: boolean
  hasMiddleware: boolean
  hasInstrumentation: boolean
  /** __NEXT_EXPERIMENTAL_SWITCHYARD_DIRECT=0: every request goes to Node. */
  directOff: boolean
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
}>

const VERSION = 1

export function buildSwitchyardRouteTable(
  input: SwitchyardRouteTableInput
): SwitchyardRouteTable {
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
    const pattern = patternOf(route.page)
    // Leaving one route out would change which route matches first, so a
    // pattern Switchyard can't match sends the whole app to Node, static
    // route.go routes included.
    if (!pattern) {
      return {
        contract: { version: VERSION },
        reason: `unsupported route pattern ${route.page}`,
      }
    }
    const app = input.appRoute(route.page)
    dynamic.push(
      app?.kind === RouteKind.APP_ROUTE_GO
        ? { path: pattern, go: app.page }
        : { path: pattern }
    )
  }

  if (Object.keys(goExact).length === 0 && !dynamic.some((route) => route.go)) {
    return { contract: { version: VERSION }, reason: 'no route.go routes' }
  }

  return {
    contract: { version: VERSION },
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
    },
  }
}

function ineligibleReason(
  input: SwitchyardRouteTableInput
): string | undefined {
  if (input.directOff) return `${SWITCHYARD_DIRECT_ENV}=0`
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
  // trailing slash; Switchyard sends every path ending in "/" to Node.
  if (input.trailingSlash) return 'trailingSlash'
  if (input.redirects.some((redirect) => !redirect.internal)) {
    return 'redirects'
  }
  // Not handled yet: Switchyard would have to strip the basePath.
  if (input.basePath) return 'basePath'
  return undefined
}

/**
 * Turns a route's page path into a segment list, or undefined when a segment
 * isn't one of the forms Switchyard can match exactly as Node does. Segments
 * are read with getSegmentParam, the parser the router itself uses.
 */
export function patternOf(page: string): PatternEntry[] | undefined {
  if (page === '/') return []
  const segments = page.split('/').slice(1)
  const pattern: PatternEntry[] = []
  for (const [i, segment] of segments.entries()) {
    // Interception markers ("(..)photo", "(.)[id]") come with rewrites of
    // their own. getSegmentParam strips the marker before reading the
    // parameter, and loses it for "(.)[[...x]]", so check first.
    if (
      INTERCEPTION_ROUTE_MARKERS.some((marker) => segment.startsWith(marker))
    ) {
      return undefined
    }
    const param = getSegmentParam(segment)
    if (!param) {
      // A literal segment. Brackets getSegmentParam didn't read as a
      // parameter ("a[b]") are a form Switchyard doesn't match.
      if (segment === '' || /[[\]]/.test(segment)) return undefined
      pattern.push(segment)
      continue
    }
    // getSegmentParam reads "[a][b]" as one parameter named "a][b", and "[]"
    // as a parameter with an empty name; the router reads the first as
    // parameter a followed by the literal "[b]", and the second as the
    // literal "[]".
    if (!param.paramName || /[[\]]/.test(param.paramName)) return undefined
    if (param.paramType === 'dynamic') {
      pattern.push({ param: param.paramName })
    } else if (
      param.paramType === 'catchall' ||
      param.paramType === 'optional-catchall'
    ) {
      // A catch-all can only end a pattern.
      if (i !== segments.length - 1) return undefined
      pattern.push({
        rest: param.paramName,
        min: param.paramType === 'catchall' ? 1 : 0,
      })
    } else {
      return undefined
    }
  }
  return pattern
}

type FsChecker = Awaited<ReturnType<typeof setupFsCheck>>

/** What collectSwitchyardRouteTable reads from the router's file lookup. */
export type SwitchyardFsChecker = Pick<
  FsChecker,
  | 'getMiddlewareMatchers'
  | 'headers'
  | 'onMatchHeaders'
  | 'redirects'
  | 'rewrites'
  | 'publicFolderItems'
  | 'appFiles'
  | 'pageFiles'
  | 'getDynamicRoutes'
  | 'getRouteDefinition'
>

/** What collectSwitchyardRouteTable reads from the app's config. */
export type SwitchyardConfig = Pick<
  NextConfigComplete | NextConfigRuntime,
  | 'distDir'
  | 'basePath'
  | 'i18n'
  | 'trailingSlash'
  | 'compress'
  | 'useFileSystemPublicRoutes'
> & {
  experimental: Pick<NextConfigRuntime['experimental'], 'goRoutes'>
}

/**
 * Builds Switchyard's route table from what the router loaded at
 * startup, so Switchyard and Node route from the same data.
 */
export function collectSwitchyardRouteTable(
  opts: Readonly<{
    dir: string
    config: SwitchyardConfig
    fsChecker: SwitchyardFsChecker
  }>
): SwitchyardRouteTable {
  const { config, fsChecker } = opts
  const serverDir = path.join(opts.dir, config.distDir, 'server')
  return buildSwitchyardRouteTable({
    goRoutes: Boolean(config.experimental.goRoutes),
    basePath: config.basePath,
    hasI18n: Boolean(config.i18n),
    trailingSlash: Boolean(config.trailingSlash),
    compress: config.compress !== false,
    useFileSystemPublicRoutes: config.useFileSystemPublicRoutes !== false,
    // The router's own test for a proxy (proxy.ts, middleware or proxy.go),
    // as in router-server.ts. Without a proxy the matcher is `() => false`,
    // a function with no parameters; a real matcher takes some, so `length`
    // (the function's parameter count) tells the two apart.
    hasMiddleware: Boolean(fsChecker.getMiddlewareMatchers()?.length),
    hasInstrumentation: fs.existsSync(
      path.join(serverDir, `${INSTRUMENTATION_HOOK_FILENAME}.js`)
    ),
    directOff: process.env[SWITCHYARD_DIRECT_ENV] === '0',
    keepsInternalHeaders: Boolean(process.env.NEXT_PRIVATE_TEST_HEADERS),
    headers: fsChecker.headers,
    onMatchHeaders: fsChecker.onMatchHeaders,
    redirects: fsChecker.redirects,
    beforeFilesRewrites: fsChecker.rewrites.beforeFiles,
    afterFilesRewrites: fsChecker.rewrites.afterFiles,
    publicFiles: fsChecker.publicFolderItems,
    appFiles: fsChecker.appFiles,
    pageFiles: fsChecker.pageFiles,
    dynamicRoutes: fsChecker.getDynamicRoutes(),
    appRoute: (pathname) =>
      fsChecker.getRouteDefinition('appFile', pathname, undefined),
    internalHeaders: INTERNAL_HEADERS,
    maxHeaderBytes: http.maxHeaderSize,
  })
}
