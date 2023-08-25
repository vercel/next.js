import { connect } from '@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client'
import {
  connectHMR,
  addEventListener,
  sendMessage,
} from '@vercel/turbopack-ecmascript-runtime/dev/client/websocket'
import { register, ReactDevOverlay } from '../overlay/client'

export function initializeHMR(options: { assetPrefix: string }) {
  connect({
    addEventListener,
    sendMessage,
  })
  connectHMR({
    assetPrefix: options.assetPrefix,
    log: true,
    path: '/turbopack-hmr',
  })
  register()
}

export { ReactDevOverlay }
