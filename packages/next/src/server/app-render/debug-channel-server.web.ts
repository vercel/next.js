/**
 * Web debug channel implementation.
 * Loaded by debug-channel-server.ts.
 */

import type { AnyStream } from './app-render-prerender-utils'
import type { LocalRenderTiming } from '../lib/trace/react-render-timing'

export type DebugChannelPair = {
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
  localRenderTiming?: LocalRenderTiming
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
  let localRenderTiming: LocalRenderTiming | undefined
  if (process.env.__NEXT_DEV_SERVER && process.env.NEXT_RUNTIME !== 'edge') {
    const { createLocalRenderTiming } =
      require('../lib/trace/react-render-timing') as typeof import('../lib/trace/react-render-timing')
    localRenderTiming = createLocalRenderTiming()
  } else {
    localRenderTiming = undefined
  }
  let readableController: ReadableStreamDefaultController | undefined

  const clientSideReadable = new ReadableStream<Uint8Array>({
    start(controller) {
      readableController = controller
    },
    cancel() {
      localRenderTiming?.abort()
    },
  })

  return {
    serverSide: {
      writable: new WritableStream<Uint8Array>({
        write(chunk) {
          localRenderTiming?.readDebugChunk(chunk)
          readableController?.enqueue(chunk)
        },
        close() {
          localRenderTiming?.finishDebug()
          readableController?.close()
        },
        abort(err) {
          localRenderTiming?.abort()
          readableController?.error(err)
        },
      }),
    },
    clientSide: { readable: clientSideReadable },
    localRenderTiming,
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
