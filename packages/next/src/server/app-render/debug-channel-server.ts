export type DebugChannelPair = {
  // serverSide is passed opaquely as options.debugChannel to React's
  // renderToReadableStream (web) or renderToPipeableStream (Node).
  // The two APIs expect different shapes:
  //   - Web:  { readable?, writable: WritableStream }
  //   - Node: a Writable stream (has .write() directly on the object)
  // Consumers should not access properties on serverSide directly.
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
}

// Passed directly as options.debugChannel to React's render functions.
// React's web API (renderToReadableStream) reads .writable from it.
// React's Node API (renderToPipeableStream) checks .write() on it directly.
export type DebugChannelServer =
  | {
      readable?: ReadableStream<Uint8Array>
      writable: WritableStream<Uint8Array>
    }
  | import('node:stream').Writable
export type DebugChannelClient = {
  readable: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
}

export function createDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }

  let readableController: ReadableStreamDefaultController | undefined

  const clientSideReadable = new ReadableStream<Uint8Array>({
    start(controller) {
      readableController = controller
    },
  })

  // When node streams are enabled, create a Node.js Writable as the server
  // side. React's renderToPipeableStream checks typeof debugChannel.write
  // to find its debug destination. A web WritableStream doesn't have .write()
  // on the object, so it must be a Node Writable.
  if (process.env.__NEXT_USE_NODE_STREAMS) {
    const { Writable } = require('node:stream') as typeof import('node:stream')
    const serverSide = new Writable({
      write(
        chunk: Buffer | Uint8Array,
        _encoding: string,
        callback: (error?: Error | null) => void
      ) {
        readableController?.enqueue(chunk)
        callback()
      },
      final(callback: (error?: Error | null) => void) {
        readableController?.close()
        callback()
      },
      destroy(_err, callback) {
        readableController?.error(_err)
        callback(_err)
      },
    })
    return { serverSide, clientSide: { readable: clientSideReadable } }
  }

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
