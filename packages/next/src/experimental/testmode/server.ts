import type { WorkerRequestHandler } from '../../server/lib/types'
import type { NodeRequestHandler } from '../../server/next-server'
import { withRequest, type TestRequestReader } from './context'
import { interceptFetch } from './fetch'
import { interceptHttpGet } from './httpget'
import type { IncomingMessage } from 'http'

const reader: TestRequestReader<IncomingMessage> = {
  url(req) {
    return req.url ?? ''
  },
  header(req, name) {
    const h = req.headers[name]
    if (h === undefined || h === null) {
      return null
    }
    if (typeof h === 'string') {
      return h
    }
    return h[0] ?? null
  },
}

export function interceptTestApis(): () => void {
  const originalFetch = global.fetch
  const restoreFetch = interceptFetch(originalFetch)
  const restoreHttpGet = interceptHttpGet(originalFetch)

  // Cleanup.
  return () => {
    restoreFetch()
    restoreHttpGet()
  }
}

export function wrapRequestHandlerWorker(
  handler: WorkerRequestHandler
): WorkerRequestHandler {
  return (req, res) => withRequest(req, reader, () => handler(req, res))
}

export function wrapRequestHandlerNode(
  handler: NodeRequestHandler
): NodeRequestHandler {
  return (req, res, parsedUrl) =>
    withRequest(req, reader, () => handler(req, res, parsedUrl))
}
