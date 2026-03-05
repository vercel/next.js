/**
 * Node debug channel implementation.
 * Loaded by debug-channel-server.ts when __NEXT_USE_NODE_STREAMS is enabled.
 */

import { PassThrough } from 'node:stream'
import type { DebugChannelPair } from './debug-channel-server.web'

export function createDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }
  return createNodeDebugChannel()
}

export function createNodeDebugChannel(): DebugChannelPair {
  const duplex = new PassThrough()

  return {
    serverSide: duplex,
    clientSide: { readable: duplex },
  }
}
