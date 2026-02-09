export type DebugChannelPair = {
  // serverSide is the write end. When using Node streams, this is a
  // PassThrough (Node Writable). React's renderToPipeableStream checks
  // typeof debugChannel.write === 'function' and writes directly.
  // When using web streams, this is { writable: WritableStream }.
  serverSide: DebugChannelServer | import('node:stream').Writable
  clientSide: DebugChannelClient
}

// Web shape: React's renderToReadableStream reads .writable from it.
// For renderToPipeableStream (Node), use toNodeDebugChannel() to convert.
export type DebugChannelServer = {
  readable?: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}
export type DebugChannelClient = {
  readable: ReadableStream<Uint8Array> | import('node:stream').Readable
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

  if (process.env.__NEXT_USE_NODE_STREAMS) {
    return createNodeDebugChannel()
  }

  return createWebDebugChannel()
}

function createWebDebugChannel(): DebugChannelPair {
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

function createNodeDebugChannel(): DebugChannelPair {
  const { Readable, Writable } =
    require('node:stream') as typeof import('node:stream')

  // The read side is a plain Readable (NOT a PassThrough/Duplex).
  // PassThrough is a Transform (Duplex) which has both readable and writable
  // sides. Node's `for await...of` uses endOfStream() internally, which checks
  // both sides of a Duplex. Ending the writable side triggers a 'close' event
  // that endOfStream interprets as ERR_STREAM_PREMATURE_CLOSE before the
  // async iterator finishes consuming the readable side. A plain Readable has
  // no writable side, so endOfStream only checks readable completion via
  // push(null), which works cleanly with async iteration.
  // autoDestroy: false is critical. By default (Node 16+), a push-mode Readable
  // that receives push(null) gets auto-destroyed if nobody is consuming it yet.
  // If the render completes and the event loop ticks before the tee is set up,
  // the Readable is destroyed and won't emit 'data' events for buffered data.
  const reader = new Readable({ read() {}, autoDestroy: false })

  // The write side must be a plain Writable (NOT a Duplex/PassThrough).
  // React's renderToPipeableStream checks `typeof debugChannel.read === 'function'`
  // to detect a bidirectional channel. If it finds .read(), it reads from the
  // same object expecting debug commands back from the client, which causes
  // "Unknown command" errors when it reads its own output.
  //
  // autoDestroy: false is critical. Without it, the Writable auto-destroys
  // after end(), triggering its destroy() handler which explicitly destroys
  // the reader. The reader may not be consumed yet (tee setup happens later
  // after an async gap), so destroying it would discard buffered debug data.
  const writer = new Writable({
    autoDestroy: false,
    write(
      chunk: Buffer | Uint8Array,
      _encoding: string,
      callback: (error?: Error | null) => void
    ) {
      reader.push(chunk)
      callback()
    },
    final(callback: (error?: Error | null) => void) {
      reader.push(null)
      callback()
    },
    destroy(err, callback) {
      reader.destroy(err ?? undefined)
      callback(err)
    },
  })

  return {
    // Plain Writable: has .write() but NOT .read(), so React uses it
    // write-only. The isNodeWritable check in pipeable-stream-wrappers.ts
    // also passes, skipping toNodeDebugChannel().
    serverSide: writer,
    // Plain Readable: available for tee or direct consumption.
    // No writable side means for-await-of works without ERR_STREAM_PREMATURE_CLOSE.
    clientSide: { readable: reader },
  }
}
