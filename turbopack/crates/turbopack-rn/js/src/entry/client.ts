// @ts-expect-error
import { Platform } from 'react-native'
import { connect } from '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client'
import { connectHMR, addMessageListener, sendMessage } from './websocket'

export function initializeHMR(options: { assetPrefix: string }) {
  // @ts-ignore
  let entry = process.env.TURBOPACK_RN_ENTRY
  if (entry == null) {
    throw new Error('Failed to initialize HMR: TURBOPACK_RN_ENTRY is not set')
  }

  connect({
    addMessageListener,
    sendMessage,
    onUpdateError: console.error,
  })
  connectHMR({
    assetPrefix: options.assetPrefix,
    log: true,
    path: `/turbopack-hmr?platform=${Platform.OS}&entry=${entry}`,
  })
}
