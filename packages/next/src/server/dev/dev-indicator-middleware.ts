import type { ServerResponse, IncomingMessage } from 'http'
import { middlewareResponse } from '../../client/components/react-dev-overlay/server/middleware-response'
import * as Log from '../../build/output/log'
import { devIndicatorServerState } from './dev-indicator-server-state'

const DISABLE_DEV_INDICATOR_PREFIX = '/__nextjs_disable_dev_indicator'
// TODO: Better testing.
// For testing, 3 seconds, otherwise 1 day.
const TIME = process.env.__NEXT_TEST_MODE ? 3000 : 1000 * 60 * 60 * 24

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

      // 1 day from now
      devIndicatorServerState.disabledUntil = Date.now() + TIME

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
