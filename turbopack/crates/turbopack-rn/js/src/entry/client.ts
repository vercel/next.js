// @ts-expect-error
import { Platform } from 'react-native'
import { connect } from '@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client'
import { connectHMR, addMessageListener, sendMessage } from './websocket'

export function initializeHMR(options: { assetPrefix: string }) {
  connect({
    addMessageListener,
    sendMessage,
    onUpdateError: console.error,
  })
  connectHMR({
    assetPrefix: options.assetPrefix,
    log: true,
    // TODO entry should be dynamic
    path: `/turbopack-hmr?platform=${Platform.OS}&entry=index.tsx`,
  })
}
