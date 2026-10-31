import {
  connect,
  TURBOPACK_CHUNK_UPDATE_LISTENERS_GLOBAL,
} from '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client'
import { connectHMR, addMessageListener, sendMessage } from './websocket'

export function initializeHMR(options: { assetPrefix: string }) {
  connect({
    addMessageListener,
    sendMessage,
    onUpdateError: console.error,
    chunkUpdateListenersGlobal: TURBOPACK_CHUNK_UPDATE_LISTENERS_GLOBAL,
  })
  connectHMR({
    assetPrefix: options.assetPrefix,
    log: true,
    path: '/turbopack-hmr',
  })
}
