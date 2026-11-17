import fs from 'fs'
import http from 'http'
import path from 'path'
import type { NextConfigComplete, NextConfigRuntime } from '../config-shared'
import type { setupFsCheck } from './router-utils/filesystem'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../lib/constants'
import { INTERNAL_HEADERS } from './server-ipc/utils'
import { frontRouteTable, type FrontRouteTable } from './front-route-table'

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
  })
}
