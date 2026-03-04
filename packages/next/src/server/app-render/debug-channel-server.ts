/**
 * Compile-time switcher for debug channel operations.
 *
 * When __NEXT_USE_NODE_STREAMS is true, uses a Node Writable-based channel.
 * Otherwise, uses web WritableStream APIs.
 */
export type {
  DebugChannelPair,
  DebugChannelServer,
} from './debug-channel-server.web'

type DebugChannelMod = {
  createDebugChannel: typeof import('./debug-channel-server.web').createDebugChannel
  toNodeDebugChannel: (...args: any[]) => import('node:stream').Writable
}

let _m: DebugChannelMod
if (process.env.__NEXT_USE_NODE_STREAMS) {
  _m =
    require('./debug-channel-server.node') as typeof import('./debug-channel-server.node')
} else {
  _m = (require('./debug-channel-server.web') as typeof import('./debug-channel-server.web')) as DebugChannelMod
}

export const createDebugChannel = _m.createDebugChannel
export const toNodeDebugChannel = _m.toNodeDebugChannel
