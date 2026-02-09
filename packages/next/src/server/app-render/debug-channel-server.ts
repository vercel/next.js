export type DebugChannelPair = {
  // serverSide is always in the web shape ({ writable: WritableStream }).
  // Consumers that need a Node Writable (for renderToPipeableStream) should
  // call toNodeDebugChannel() to convert.
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
}

// Always the web shape: React's renderToReadableStream reads .writable from it.
// For renderToPipeableStream (Node), use toNodeDebugChannel() to convert.
export type DebugChannelServer = {
  readable?: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}
export type DebugChannelClient = {
  readable: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
}

/**
 * Converts a web-shaped debug channel to a Node Writable for use with
 * React's renderToPipeableStream, which checks typeof debugChannel.write
 * to find its debug destination.
 */
export function toNodeDebugChannel(
  webDebugChannel: DebugChannelServer
): import('node:stream').Writable {
  // Guard so webpack can DCE node:stream require for edge builds.
  if (!process.env.__NEXT_USE_NODE_STREAMS) {
    throw new Error(
      'toNodeDebugChannel can only be used in Node.js environments, this is a bug in the Next.js codebase'
    )
  } else {
    const { Writable } = require('node:stream') as typeof import('node:stream')
    const writer = webDebugChannel.writable.getWriter()
    return new Writable({
      write(
        chunk: Buffer | Uint8Array,
        _encoding: string,
        callback: (error?: Error | null) => void
      ) {
        writer.write(chunk).then(() => callback(), callback)
      },
      final(callback: (error?: Error | null) => void) {
        writer.close().then(() => callback(), callback)
      },
      destroy(_err, callback) {
        writer.abort(_err).then(
          () => callback(_err),
          () => callback(_err)
        )
      },
    })
  }
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
