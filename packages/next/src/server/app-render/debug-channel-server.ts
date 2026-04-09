/**
 * Compile-time switcher for debug channel operations.
 *
 * When __NEXT_USE_NODE_STREAMS is true, uses a Node PassThrough-based channel.
 * Otherwise, uses web WritableStream APIs.
 */
export type {
  DebugChannelPair,
  DebugChannelServer,
} from './debug-channel-server.web'
import type { DebugChannelPair } from './debug-channel-server.web'

type DebugChannelMod = {
  createWebDebugChannel: typeof import('./debug-channel-server.web').createWebDebugChannel
  createNodeDebugChannel: typeof import('./debug-channel-server.web').createNodeDebugChannel
}

let _m: DebugChannelMod
if (process.env.__NEXT_USE_NODE_STREAMS) {
  _m =
    require('./debug-channel-server.node') as typeof import('./debug-channel-server.node')
} else {
  _m =
    require('./debug-channel-server.web') as typeof import('./debug-channel-server.web')
}

export function createWebDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }

  return _m.createWebDebugChannel()
}

export function createNodeDebugChannel(): DebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }

  return _m.createNodeDebugChannel()
}
