import type { DebugChannelBrowser } from 'react-server-dom-webpack/client.browser'
import { NEXT_REQUEST_ID_HEADER } from '../app-router-headers'
import { InvariantError } from '../../../shared/lib/invariant-error'

export function createDebugChannel(
  responseHeaders: Headers | undefined
): DebugChannelBrowser | undefined {
  if (process.env.NODE_ENV === 'production') {
    return
  }

  let requestId: string | undefined

  if (responseHeaders) {
    requestId = responseHeaders.get(NEXT_REQUEST_ID_HEADER) ?? undefined

    if (!requestId) {
      throw new InvariantError(
        `Expected a ${JSON.stringify(NEXT_REQUEST_ID_HEADER)} response header.`
      )
    }
  } else {
    requestId = self.__next_r

    if (!requestId) {
      throw new InvariantError(
        `Expected a request ID to be defined for the document via self.__next_r.`
      )
    }
  }

  const controllers: Map<string, ReadableStreamDefaultController> =
    (window.__NEXT_REACT_DEBUG_CHUNKS_CONTROLLERS_BY_REQUEST_ID ??= new Map())

  return {
    readable: new ReadableStream({
      start(controller) {
        controllers.set(requestId, controller)
      },
    }),
  }
}
