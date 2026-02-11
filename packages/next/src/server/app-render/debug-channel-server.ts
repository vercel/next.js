import type {
  DebugChannelPair,
  DebugChannelServer,
  DebugChannelClient,
} from './debug-channel-server.web'

type DebugChannelRuntimeModule = {
  createDebugChannel: () => DebugChannelPair | undefined
  toNodeDebugChannel: (
    webDebugChannel: DebugChannelServer
  ) => import('node:stream').Writable
}

let debugChannelRuntimeModule: DebugChannelRuntimeModule

if (process.env.NEXT_RUNTIME === 'edge') {
  debugChannelRuntimeModule =
    require('./debug-channel-server.web') as typeof import('./debug-channel-server.web')
} else if (process.env.__NEXT_USE_NODE_STREAMS) {
  debugChannelRuntimeModule =
    require('./debug-channel-server.node') as typeof import('./debug-channel-server.node') as unknown as DebugChannelRuntimeModule
} else {
  debugChannelRuntimeModule =
    require('./debug-channel-server.web') as typeof import('./debug-channel-server.web')
}

export const createDebugChannel = debugChannelRuntimeModule.createDebugChannel
export const toNodeDebugChannel = debugChannelRuntimeModule.toNodeDebugChannel

export type { DebugChannelPair, DebugChannelServer, DebugChannelClient }
