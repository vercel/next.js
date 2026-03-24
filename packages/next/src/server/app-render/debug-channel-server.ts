/**
 * Compile-time switcher for debug channel operations.
 *
 * Simple re-export from the web implementation.
 * A future change will add a conditional branch for node streams.
 */
export type {
  DebugChannelPair,
  DebugChannelServer,
} from './debug-channel-server.web'

export {
  createDebugChannel,
  toNodeDebugChannel,
} from './debug-channel-server.web'
