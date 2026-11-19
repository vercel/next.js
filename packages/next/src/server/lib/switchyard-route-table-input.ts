import fs from 'fs'
import http from 'http'
import path from 'path'
import type { NextConfigComplete, NextConfigRuntime } from '../config-shared'
import type { setupFsCheck } from './router-utils/filesystem'
import { INSTRUMENTATION_HOOK_FILENAME } from '../../lib/constants'
import { INTERNAL_HEADERS } from './server-ipc/utils'
import {
  switchyardRouteTable,
  type SwitchyardRouteTable,
} from './switchyard-route-table'

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
  return switchyardRouteTable({
    goRoutes: Boolean(config.experimental.goRoutes),
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
    appRoute: (pathname) =>
      fsChecker.getRouteDefinition('appFile', pathname, undefined),
    internalHeaders: INTERNAL_HEADERS,
    maxHeaderBytes: http.maxHeaderSize,
  })
}
