import { middlewareResponse } from './middleware-response'
import type { ServerResponse, IncomingMessage } from 'http'
import * as inspector from 'inspector'

export function getAttachNodejsDebuggerMiddleware() {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(`http://n${req.url}`)

    if (pathname !== '/__nextjs_attach-nodejs-inspector') {
      return next()
    }

    try {
      const isInspecting = inspector.url() !== undefined
      const debugPort = process.debugPort
      if (!isInspecting) {
        // Node.js will already log that the inspector is listening.
        inspector.open(debugPort)
      }

      const inspectorURLRaw = inspector.url()
      if (inspectorURLRaw === undefined) {
        // could not open, possibly because already in use.
        return middlewareResponse.badRequest(
          res,
          `Failed to open port "${debugPort}". Address may be already in use.`
        )
      }
      const inspectorURL = new URL(inspectorURLRaw)

      const debugInfoListResponse = await fetch(
        `http://${inspectorURL.host}/json/list`
      )
      const debugInfoList = await debugInfoListResponse.json()
      if (!Array.isArray(debugInfoList) || debugInfoList.length === 0) {
        throw new Error('No debug targets found')
      }

      return middlewareResponse.json(res, debugInfoList[0].devtoolsFrontendUrl)
    } catch (error) {
      return middlewareResponse.internalServerError(res)
    }
  }
}
