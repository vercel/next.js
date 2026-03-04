/**
 * Node debug channel implementation.
 * Loaded by debug-channel-server.ts when __NEXT_USE_NODE_STREAMS is enabled.
 */

import { PassThrough, Readable } from 'node:stream'

type NodeDebugChannelServer = {
  readable?: ReadableStream<Uint8Array>
  writable: import('node:stream').Writable
}

type NodeDebugChannelPair = {
  serverSide: NodeDebugChannelServer
  clientSide: {
    readable: ReadableStream<Uint8Array>
    writable?: WritableStream<Uint8Array>
  }
}

export function createDebugChannel():
  | import('./debug-channel-server.web').DebugChannelPair
  | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }
  return createNodeDebugChannel() as unknown as import('./debug-channel-server.web').DebugChannelPair
}

export function createNodeDebugChannel(): NodeDebugChannelPair {
  const duplex = new PassThrough()
  const clientReadable = Readable.toWeb(duplex) as ReadableStream<Uint8Array>

  return {
    serverSide: {
      writable: duplex,
    },
    clientSide: { readable: clientReadable },
  }
}
