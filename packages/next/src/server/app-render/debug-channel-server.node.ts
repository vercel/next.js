/**
 * Node debug channel implementation.
 * Loaded by debug-channel-server.ts when __NEXT_USE_NODE_STREAMS is enabled.
 */

import { PassThrough, Writable } from 'node:stream'
import type { DebugChannelPair } from './debug-channel-server.web'

export function createDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }
  return createNodeDebugChannel()
}

function createNodeDebugChannel(): DebugChannelPair {
  const readable = new PassThrough()

  // Use a plain Writable instead of exposing the PassThrough directly.
  // React's renderToPipeableStream detects .read() on the debugChannel and
  // enters bidirectional mode, reading its own output back as commands.
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      readable.push(chunk)
      callback()
    },
    final(callback) {
      readable.push(null)
      callback()
    },
  })

  return {
    serverSide: writable,
    clientSide: { readable },
  }
}
