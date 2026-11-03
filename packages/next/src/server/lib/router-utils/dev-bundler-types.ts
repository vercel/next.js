import type { IncomingMessage, ServerResponse } from 'http'
import type { RoutesManifest } from '../../../build'
import type { ProxyMatcher } from '../../../build/analysis/get-page-static-info'
import type { UnwrapPromise } from '../../../lib/coalesced-function'
import type { MiddlewareRouteMatch } from '../../../shared/lib/router/utils/middleware-route-matcher'
import type { Telemetry } from '../../../telemetry/storage'
import type { NextConfigComplete } from '../../config-shared'
import type { NextJsHotReloaderInterface } from '../../dev/hot-reloader-types'
import type { LazyRenderServerInstance } from '../router-server'

export type SetupOpts = {
  renderServer: LazyRenderServerInstance
  dir: string
  turbo?: boolean
  appDir?: string
  pagesDir?: string
  telemetry: Telemetry
  isCustomServer?: boolean
  fsChecker: UnwrapPromise<
    ReturnType<typeof import('./filesystem').setupFsCheck>
  >
  nextConfig: NextConfigComplete
  port: number
  onDevServerCleanup: ((listener: () => Promise<void>) => void) | undefined
  resetFetch: () => void
  serverFastRefresh?: boolean
  hasVulnerabilityInsight: Promise<boolean>
}

export interface DevRoutesManifest {
  version: number
  caseSensitive: RoutesManifest['caseSensitive']
  basePath: RoutesManifest['basePath']
  rewrites: RoutesManifest['rewrites']
  redirects: RoutesManifest['redirects']
  headers: RoutesManifest['headers']
  onMatchHeaders: RoutesManifest['headers']
  i18n: RoutesManifest['i18n']
  skipProxyUrlNormalize: RoutesManifest['skipProxyUrlNormalize']
}

export type ServerFields = {
  actualMiddlewareFile?: string | undefined
  actualInstrumentationHookFile?: string | undefined
  appPathRoutes?: Record<string, string | string[]>
  middleware?:
    | {
        page: string
        match: MiddlewareRouteMatch
        matchers?: ProxyMatcher[]
      }
    | undefined
  hasAppNotFound?: boolean
  interceptionRoutes?: ReturnType<
    typeof import('./filesystem').buildCustomRoute
  >[]
  setIsrStatus?: (key: string, value: boolean | undefined) => void
  resetFetch?: () => void
}

export interface DevBundler {
  serverFields: ServerFields
  hotReloader: NextJsHotReloaderInterface
  requestHandler(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<{ finished: boolean }>
  logErrorWithOriginalStack(
    err: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ): void
  ensureMiddleware(requestUrl?: string): Promise<void>
}
