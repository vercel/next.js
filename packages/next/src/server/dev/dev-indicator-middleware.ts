import type { ServerResponse, IncomingMessage } from 'http'
import { middlewareResponse } from '../../client/components/react-dev-overlay/server/middleware-response'
import * as Log from '../../build/output/log'
import { devIndicatorServerState } from './dev-indicator-state'

const DISABLE_DEV_INDICATOR_PREFIX = '/__nextjs_disable_dev_indicator'

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

      devIndicatorServerState.isDisabled = true
      if (devIndicatorServerState.isDisabled) {
        // 1 day from now
        devIndicatorServerState.disabledUntil = Date.now() + 1000 * 60 * 60 * 24
      }

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
