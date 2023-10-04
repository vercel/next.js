import type { IncomingMessage } from 'http'
import type { NextJsHotReloaderInterface } from '../dev/hot-reloader-types'

/**
 * The interface for the dev handlers global.
 */
export interface DevHandlers {
  ensurePage(
    dir: string,
    ...args: Parameters<NextJsHotReloaderInterface['ensurePage']>
  ): Promise<void>
  logErrorWithOriginalStack(
    dir: string,
    err: unknown,
    type?: 'unhandledRejection' | 'uncaughtException' | 'warning' | 'app-dir'
  ): Promise<void>
  getFallbackErrorComponents(dir: string): Promise<void>
  getCompilationError(dir: string, page: string): Promise<any>
  revalidate(
    dir: string,
    opts: {
      urlPath: string
      revalidateHeaders: IncomingMessage['headers']
      opts: any
    }
  ): Promise<{}>
}
