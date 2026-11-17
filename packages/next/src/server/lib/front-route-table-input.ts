import fs from 'fs'
import http from 'http'
import path from 'path'
import type { NextConfigComplete, NextConfigRuntime } from '../config-shared'
import type { setupFsCheck } from './router-utils/filesystem'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../lib/constants'
import { generateETag } from './etag'
import { INTERNAL_HEADERS } from './server-ipc/utils'
import {
  frontRouteTable,
  type ErrorPage,
  type FrontRouteTable,
} from './front-route-table'

type FsChecker = Awaited<ReturnType<typeof setupFsCheck>>

/**
 * Builds the front server's route table from what the router loaded at
 * startup, so the front and Node route from the same data.
 */
export function collectFrontRouteTable(
  opts: Readonly<{
    dir: string
    dev: boolean
    config: NextConfigComplete | NextConfigRuntime
    fsChecker: FsChecker
  }>
): FrontRouteTable {
  const { config, fsChecker } = opts
  const serverDir = path.join(opts.dir, config.distDir, 'server')
  return frontRouteTable({
    goRoutes: !opts.dev && Boolean(config.experimental.goRoutes),
    basePath: config.basePath,
    hasI18n: Boolean(config.i18n),
    trailingSlash: Boolean(config.trailingSlash),
    compress: config.compress !== false,
    useFileSystemPublicRoutes: config.useFileSystemPublicRoutes !== false,
    // The router's own test for a proxy (proxy.ts, middleware or proxy.go).
    hasMiddleware: Boolean(fsChecker.getMiddlewareMatchers()?.length),
    hasInstrumentation: fs.existsSync(
      path.join(serverDir, `${INSTRUMENTATION_HOOK_FILENAME}.js`)
    ),
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
    errorPage: readErrorPage(serverDir, config),
  })
}

/**
 * Node's answer when a route.go worker fails before sending headers: the
 * prerendered 500 page, with the headers Node sends it with.
 */
function readErrorPage(
  serverDir: string,
  config: NextConfigComplete | NextConfigRuntime
): ErrorPage | undefined {
  let body: string
  try {
    body = fs.readFileSync(path.join(serverDir, 'pages', '500.html'), 'utf8')
  } catch {
    return undefined
  }
  const headers: Array<readonly [string, string]> = [
    [
      'Cache-Control',
      'private, no-cache, no-store, max-age=0, must-revalidate',
    ],
  ]
  if (config.poweredByHeader) headers.push(['X-Powered-By', 'Next.js'])
  if (config.generateEtags) headers.push(['ETag', generateETag(body)])
  headers.push(['Content-Type', 'text/html; charset=utf-8'])
  // Node's compression middleware marks every compressible response.
  if (config.compress !== false) headers.push(['Vary', 'Accept-Encoding'])
  return { headers, body }
}
