/**
 * Node debug channel implementation.
 * Loaded by debug-channel-server.ts when __NEXT_USE_NODE_STREAMS is enabled.
 */

import type { Writable as NodeWritable } from 'node:stream'
import { PassThrough, Readable } from 'node:stream'

import type { DebugChannelServer } from './debug-channel-server.web'

type WebWritableStream = import('stream/web').WritableStream

type NodeDebugChannelServer = {
  readable?: ReadableStream<Uint8Array>
  writable: NodeWritable
}

type NodeDebugChannelPair = {
  serverSide: NodeDebugChannelServer
  clientSide: {
    readable: ReadableStream<Uint8Array>
    writable?: WritableStream<Uint8Array>
  }
}

function isNodeWritable(value: unknown): value is NodeWritable {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { write?: unknown }).write === 'function' &&
    typeof (value as { on?: unknown }).on === 'function'
  )
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

export function toNodeDebugChannel(
  debugChannel: DebugChannelServer | NodeDebugChannelServer
): NodeWritable {
  const { writable } = debugChannel
  if (isNodeWritable(writable)) {
    return writable
  }

  if (process.env.TURBOPACK) {
    const { Writable } = require('node:stream') as typeof import('node:stream')
    return Writable.fromWeb(writable as WebWritableStream)
  } else {
    const { Writable } = __non_webpack_require__(
      'node:stream'
    ) as typeof import('node:stream')
    return Writable.fromWeb(writable as WebWritableStream)
  }
}
