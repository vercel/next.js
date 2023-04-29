import { connect } from '@vercel/turbopack-dev/client/hmr-client'
import { connectHMR } from '@vercel/turbopack-dev/client/websocket'
import { register, ReactDevOverlay } from '../overlay/client'

export function initializeHMR(options: { assetPrefix: string }) {
  connect({
    assetPrefix: options.assetPrefix,
  })
  connectHMR({
    assetPrefix: options.assetPrefix,
    log: true,
    path: '/turbopack-hmr',
  })
  register()
}

export { ReactDevOverlay }
