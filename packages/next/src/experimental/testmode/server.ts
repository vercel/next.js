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

const interceptedSymbol = Symbol.for('next.testmode.intercepted')

export function interceptTestApis(): () => void {
  // In development the render server runs in the same process as the router
  // server, so both call this function. @mswjs/interceptors throws when its
  // global replacements are applied a second time, so make repeated
  // interception within the same process a no-op.
  const globalState = globalThis as { [interceptedSymbol]?: boolean }
  if (globalState[interceptedSymbol] === true) {
    return () => {}
  }
  globalState[interceptedSymbol] = true

  const originalFetch = global.fetch
  const restoreFetch = interceptFetch(originalFetch)
  const restoreHttpGet = interceptHttpGet(originalFetch)

  // Cleanup.
  return () => {
    globalState[interceptedSymbol] = false
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
