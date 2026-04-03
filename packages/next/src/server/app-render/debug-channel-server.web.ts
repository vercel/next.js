/**
 * Web debug channel implementation.
 * Loaded by debug-channel-server.ts.
 */

import type { AnyStream } from './app-render-prerender-utils'

export type DebugChannelPair = {
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
}

// Opaque: PassThrough on node, { writable: WritableStream } on web.
// Each React render API handles its own variant.

export type DebugChannelServer = any

type DebugChannelClient = {
  readable: AnyStream
}

export function createDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }
  return createWebDebugChannel()
}

export function createWebDebugChannel(): DebugChannelPair {
  let readableController: ReadableStreamDefaultController | undefined

  const clientSideReadable = new ReadableStream<Uint8Array>({
    start(controller) {
      readableController = controller
    },
  })

  return {
    serverSide: {
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          readableController?.enqueue(chunk)
        },
        close() {
          readableController?.close()
        },
        abort(err) {
          readableController?.error(err)
        },
      }),
    },
    clientSide: { readable: clientSideReadable },
  }
}
