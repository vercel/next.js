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
export type { NodeDebugChannelPair } from './debug-channel-server.node'
import type { DebugChannelPair } from './debug-channel-server.web'
import type { NodeDebugChannelPair } from './debug-channel-server.node'

type DebugChannelMod = {
  createWebDebugChannel: typeof import('./debug-channel-server.web').createWebDebugChannel
  createNodeDebugChannel: typeof import('./debug-channel-server.node').createNodeDebugChannel
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

export function createNodeDebugChannel(): NodeDebugChannelPair | undefined {
  if (process.env.NODE_ENV === 'production') {
    return undefined
  }

  return _m.createNodeDebugChannel()
}
