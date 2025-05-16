import type { ServerResponse, IncomingMessage } from 'http'
import type { Telemetry } from '../../../../telemetry/storage'
import { RESTART_EXIT_CODE } from '../../../../server/lib/utils'
import { middlewareResponse } from './middleware-response'

const EVENT_DEV_OVERLAY_RESTART_SERVER = 'DEV_OVERLAY_RESTART_SERVER'

export function getRestartDevServerMiddleware(telemetry: Telemetry) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(`http://n${req.url}`)
    if (pathname !== '/__nextjs_restart_dev' || req.method !== 'POST') {
      return next()
    }

    telemetry.record({
      eventName: EVENT_DEV_OVERLAY_RESTART_SERVER,
      payload: {},
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
}
