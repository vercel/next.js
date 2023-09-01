import type { IncomingMessage, ServerResponse } from 'http'
import type { UrlObject } from 'url'
import type { Duplex } from 'stream'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import type getBaseWebpackConfig from '../../build/webpack-config'
import type { RouteMatch } from '../future/route-matches/route-match'

export interface NextJsHotReloaderInterface {
  activeWebpackConfigs?: Array<Awaited<ReturnType<typeof getBaseWebpackConfig>>>
  serverStats: webpack.Stats | null
  edgeServerStats: webpack.Stats | null
  run(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: UrlObject
  ): Promise<{ finished?: true }>

  setHmrServerError(error: Error | null): void
  clearHmrServerError(): void
  start(): Promise<void>
  stop(): Promise<void>
  send(action?: string | any, ...args: any[]): void
  getCompilationErrors(page: string): Promise<any[]>
  onHMR(req: IncomingMessage, _socket: Duplex, head: Buffer): void
  invalidate({
    reloadAfterInvalidation,
  }: {
    reloadAfterInvalidation: boolean
  }): void
  buildFallbackError(): Promise<void>
  ensurePage({
    page,
    clientOnly,
    appPaths,
    match,
    isApp,
  }: {
    page: string
    clientOnly: boolean
    appPaths?: ReadonlyArray<string> | null
    isApp?: boolean
    match?: RouteMatch
  }): Promise<void>
}
