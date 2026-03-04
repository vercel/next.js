/**
 * Web debug channel implementation.
 * Loaded by debug-channel-server.ts.
 */

// Types defined inline for now; will move to debug-channel-server.node.ts later.
export type DebugChannelPair = {
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
}

export type DebugChannelServer = {
  readable?: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}

type DebugChannelClient = {
  readable: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
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
