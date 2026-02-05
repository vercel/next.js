export type DebugChannelPair = {
  serverSide: DebugChannelServer
  clientSide: DebugChannelClient
}

export type DebugChannelServer = {
  readable?: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
}
export type DebugChannelClient = {
  readable: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
}

export function createDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }

  let readableController: ReadableStreamDefaultController | undefined

  let clientSideReadable = new ReadableStream<Uint8Array>({
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
