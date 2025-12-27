import type { NextConfigComplete } from '../config-shared'
import type { DevBundler } from './router-utils/setup-dev-bundler'
import type { setupFsCheck } from './router-utils/filesystem'
import type { UnwrapPromise } from '../../lib/coalesced-function'
import type { Span } from '../../trace'
import type { WorkerRequestHandler } from './types'
import type { LazyRenderServerInstance } from './router-server'

type FsChecker = UnwrapPromise<ReturnType<typeof setupFsCheck>>

import path from 'path'
import { findPagesDir } from '../../lib/find-pages-dir'
import { trace } from '../../trace'
import { traceGlobals } from '../../trace/shared'
import { DevBundlerService } from './dev-bundler-service'
import { NEXT_PATCH_SYMBOL } from './patch-fetch'

export interface DevServerInitOptions {
  dir: string
  port: number
  config: NextConfigComplete
  fsChecker: FsChecker
  renderServer: LazyRenderServerInstance
  customServer?: boolean
  startServerSpan?: Span
  onDevServerCleanup: ((listener: () => Promise<void>) => void) | undefined
  originalFetch: typeof globalThis.fetch
  getRequestHandler: () => WorkerRequestHandler
}

export interface DevServerInitResult {
  bundler: DevBundler
  service: DevBundlerService
  config: NextConfigComplete
}

/**
 * Initialize the development server components.
 * This function is lazily loaded only in development mode to reduce startup time.
 */
export async function initializeDevelopmentServer(
  opts: DevServerInitOptions
): Promise<DevServerInitResult> {
  // Lazy load telemetry to avoid loading in production
  const { Telemetry } =
    require('../../telemetry/storage') as typeof import('../../telemetry/storage')

  const telemetry = new Telemetry({
    distDir: path.join(opts.dir, opts.config.distDir),
  })
  traceGlobals.set('telemetry', telemetry)

  const { pagesDir, appDir } = findPagesDir(opts.dir)

  // Lazy load setupDevBundler to avoid loading bundler code in production
  const { setupDevBundler } =
    require('./router-utils/setup-dev-bundler') as typeof import('./router-utils/setup-dev-bundler')

  const resetFetch = () => {
    globalThis.fetch = opts.originalFetch
    ;(globalThis as Record<symbol, unknown>)[NEXT_PATCH_SYMBOL] = false
  }

  const setupDevBundlerSpan = opts.startServerSpan
    ? opts.startServerSpan.traceChild('setup-dev-bundler')
    : trace('setup-dev-bundler')

  const developmentBundler = await setupDevBundlerSpan.traceAsyncFn(() =>
    setupDevBundler({
      renderServer: opts.renderServer,
      appDir,
      pagesDir,
      telemetry,
      fsChecker: opts.fsChecker,
      dir: opts.dir,
      nextConfig: opts.config,
      isCustomServer: opts.customServer,
      turbo: !!process.env.TURBOPACK,
      port: opts.port,
      onDevServerCleanup: opts.onDevServerCleanup,
      resetFetch,
    })
  )

  const devBundlerService = new DevBundlerService(
    developmentBundler,
    // The request handler is assigned later, this allows us to create a lazy
    // reference to it.
    (req, res) => {
      return opts.getRequestHandler()(req, res)
    }
  )

  return {
    bundler: developmentBundler,
    service: devBundlerService,
    config: opts.config,
  }
}
