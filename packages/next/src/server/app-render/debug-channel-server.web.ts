/**
 * Web debug channel implementation.
 * Loaded by debug-channel-server.ts.
 */

import type { AnyStream } from './app-render-prerender-utils'

export type DebugChannelPair = {
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
}

export type DebugChannelServer = any

type DebugChannelClient = {
  readable: AnyStream
}

/**
 * Creates a debug channel using web WritableStream/ReadableStream.
 * Use with renderToWebFlightStream (React's renderToReadableStream),
 * which expects debugChannel = { writable: WritableStream }.
 */
export function createWebDebugChannel(): DebugChannelPair {
  let readableController: ReadableStreamDefaultController | undefined
  // The client side might be cancelled while React is still writing to the
  // debug channel, e.g. when nobody claimed it in time (see
  // `releaseParkedStream`). In that case, we drop the remaining chunks instead
  // of erroring the server side, which React doesn't expect.
  let isCancelled = false

  const clientSideReadable = new ReadableStream<Uint8Array>({
    start(controller) {
      readableController = controller
    },
    cancel() {
      isCancelled = true
    },
  })

  return {
    serverSide: {
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          if (!isCancelled) {
            readableController?.enqueue(chunk)
          }
        },
        close() {
          if (!isCancelled) {
            readableController?.close()
          }
        },
        abort(err) {
          if (!isCancelled) {
            readableController?.error(err)
          }
        },
      }),
    },
    clientSide: { readable: clientSideReadable },
  }
}

/**
 * Creates a debug channel using Node.js streams.
 * Use with renderToNodeFlightStream (React's renderToPipeableStream),
 * which expects debugChannel to be a Node.js stream with a .write() method.
 */
export function createNodeDebugChannel(): never {
  throw new Error('not implemented')
}
