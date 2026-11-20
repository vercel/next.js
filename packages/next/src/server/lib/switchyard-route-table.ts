import fs from 'fs'
import path from 'path'
import type { NextConfigComplete, NextConfigRuntime } from '../config-shared'
import type { setupFsCheck } from './router-utils/filesystem'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../lib/constants'
import { RouteKind } from '../route-kind'

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
      nodePrefixes: readonly string[]
      nodeExact: readonly string[]
      goExact: Readonly<Record<string, string>>
    }>

export type SwitchyardRouteTableInput = Readonly<{
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
  redirects: ReadonlyArray<{ internal?: boolean }>
  beforeFilesRewrites: readonly unknown[]
  afterFilesRewrites: readonly unknown[]
  /** Paths without basePath, as the router's file lookup keeps them. */
  publicFiles: Iterable<string>
  appFiles: Iterable<string>
  pageFiles: Iterable<string>
  /** The app route registered for a pathname, as the router knows it. */
  appRoute: (pathname: string) => { kind: RouteKind; page: string } | undefined
}>

const VERSION = 1

export function buildSwitchyardRouteTable(
  input: SwitchyardRouteTableInput
): SwitchyardRouteTable {
  const reason = ineligibleReason(input)
  if (reason) return { contract: { version: VERSION }, reason }

  const nodeExact = new Set<string>([...input.publicFiles, ...input.pageFiles])
  const goExact: Record<string, string> = {}
  for (const pathname of input.appFiles) {
    const route = input.appRoute(pathname)
    if (route?.kind === RouteKind.APP_ROUTE_GO) goExact[pathname] = route.page
    else nodeExact.add(pathname)
  }

  if (Object.keys(goExact).length === 0) {
    return { contract: { version: VERSION }, reason: 'no route.go routes' }
  }

  return {
    contract: { version: VERSION },
    // Next.js's own files, and the legacy static/ folder, whose contents the
    // table doesn't list.
    nodePrefixes: ['/_next/', '/static/'],
    nodeExact: [...nodeExact].sort(),
    goExact,
  }
}

function ineligibleReason(
  input: SwitchyardRouteTableInput
): string | undefined {
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
  // Not handled yet: Switchyard would have to strip the basePath, and send
  // the Vary header and compression Node's compression middleware adds.
  if (input.basePath) return 'basePath'
  if (input.compress) return 'compress'
  return undefined
}

type FsChecker = Awaited<ReturnType<typeof setupFsCheck>>

/**
 * Builds Switchyard's route table from what the router loaded at
 * startup, so Switchyard and Node route from the same data.
 */
export function collectSwitchyardRouteTable(
  opts: Readonly<{
    dir: string
    config: NextConfigComplete | NextConfigRuntime
    fsChecker: FsChecker
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
    keepsInternalHeaders: Boolean(process.env.NEXT_PRIVATE_TEST_HEADERS),
    headers: fsChecker.headers,
    redirects: fsChecker.redirects,
    beforeFilesRewrites: fsChecker.rewrites.beforeFiles,
    afterFilesRewrites: fsChecker.rewrites.afterFiles,
    publicFiles: fsChecker.publicFolderItems,
    appFiles: fsChecker.appFiles,
    pageFiles: fsChecker.pageFiles,
    appRoute: (pathname) =>
      fsChecker.getRouteDefinition('appFile', pathname, undefined),
  })
}
