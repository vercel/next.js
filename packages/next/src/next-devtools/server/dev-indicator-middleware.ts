import type { ServerResponse, IncomingMessage } from 'http'
import { middlewareResponse } from './middleware-response'
import * as Log from '../../build/output/log'
import { devIndicatorServerState } from '../../server/dev/dev-indicator-server-state'

const DISABLE_DEV_INDICATOR_PREFIX = '/__nextjs_disable_dev_indicator'

const COOLDOWN_TIME_MS = process.env.__NEXT_DEV_INDICATOR_COOLDOWN_MS
  ? parseInt(process.env.__NEXT_DEV_INDICATOR_COOLDOWN_MS)
  : // 1 day from now
    1000 * 60 * 60 * 24

export function getDisableDevIndicatorMiddleware() {
  return async function disableDevIndicatorMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    try {
      const { pathname } = new URL(`http://n${req.url}`)

      if (!pathname.startsWith(DISABLE_DEV_INDICATOR_PREFIX)) {
        return next()
      }

      if (req.method !== 'POST') {
        return middlewareResponse.methodNotAllowed(res)
      }

      devIndicatorServerState.disabledUntil = Date.now() + COOLDOWN_TIME_MS

      return middlewareResponse.noContent(res)
    } catch (err) {
      Log.error(
        'Failed to disable the dev indicator:',
        err instanceof Error ? err.message : err
      )
      return middlewareResponse.internalServerError(res)
    }
  }
}
