import type { ServerResponse, IncomingMessage } from 'http'
import type { Telemetry } from '../../telemetry/storage'
import { RESTART_EXIT_CODE } from '../../server/lib/utils'
import { middlewareResponse } from './middleware-response'
import type { Project } from '../../build/swc/types'
import { invalidateFileSystemCache as invalidateWebpackFileSystemCache } from '../../build/webpack/cache-invalidation'

const EVENT_DEV_OVERLAY_RESTART_SERVER = 'DEV_OVERLAY_RESTART_SERVER'

interface RestartDevServerMiddlewareConfig {
  telemetry: Telemetry
  turbopackProject?: Project
  webpackCacheDirectories?: Set<string>
}

export function getRestartDevServerMiddleware({
  telemetry,
  turbopackProject,
  webpackCacheDirectories,
}: RestartDevServerMiddlewareConfig) {
  /**
   * Some random value between 1 and Number.MAX_SAFE_INTEGER (inclusive). The same value is returned
   * on every call to `__nextjs_server_status` until the server is restarted.
   *
   * Can be used to determine if two server status responses are from the same process or a
   * different (restarted) process.
   */
  const executionId: number =
    Math.floor(Math.random() * Number.MAX_SAFE_INTEGER) + 1

  async function handleRestartRequest(
    req: IncomingMessage,
    res: ServerResponse,
    searchParams: URLSearchParams
  ) {
    if (req.method !== 'POST') {
      return middlewareResponse.methodNotAllowed(res)
    }

    const shouldInvalidateFileSystemCache = searchParams.has(
      'invalidateFileSystemCache'
    )
    if (shouldInvalidateFileSystemCache) {
      if (webpackCacheDirectories != null) {
        await Promise.all(
          Array.from(webpackCacheDirectories).map(
            invalidateWebpackFileSystemCache
          )
        )
      }
      if (turbopackProject != null) {
        await turbopackProject.invalidateFileSystemCache()
      }
    }

    telemetry.record({
      eventName: EVENT_DEV_OVERLAY_RESTART_SERVER,
      payload: { invalidateFileSystemCache: shouldInvalidateFileSystemCache },
    })

    // TODO: Use flushDetached
    await telemetry.flush()

    // do this async to try to give the response a chance to send
    // it's not really important if it doesn't though
    setTimeout(() => {
      process.exit(RESTART_EXIT_CODE)
    }, 0)

    return middlewareResponse.noContent(res)
  }

  async function handleServerStatus(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'GET') {
      return middlewareResponse.methodNotAllowed(res)
    }

    return middlewareResponse.json(res, {
      executionId,
    })
  }

  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(`http://n${req.url}`)

    switch (pathname) {
      case '/__nextjs_restart_dev':
        return await handleRestartRequest(req, res, searchParams)
      case '/__nextjs_server_status':
        return await handleServerStatus(req, res)
      default:
        return next()
    }
  }
}
