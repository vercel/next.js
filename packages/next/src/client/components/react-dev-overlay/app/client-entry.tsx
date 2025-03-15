import React from 'react'
import { getSocketUrl } from '../utils/get-socket-url'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../../../server/dev/hot-reloader-types'
import GlobalError from '../../error-boundary'
import { AppDevOverlayErrorBoundary } from './app-dev-overlay-error-boundary'

const noop = () => {}

// if an error is thrown while rendering an RSC stream, this will catch it in dev
// and show the error overlay
export function createRootLevelDevOverlayElement(reactEl: React.ReactElement) {
  const socketUrl = getSocketUrl(process.env.__NEXT_ASSET_PREFIX || '')
  const socket = new window.WebSocket(`${socketUrl}/_next/webpack-hmr`)

  // add minimal "hot reload" support for RSC errors
  const handler = (event: MessageEvent) => {
    let obj
    try {
      obj = JSON.parse(event.data)
    } catch {}

    if (!obj || !('action' in obj)) {
      return
    }

    if (obj.action === HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES) {
      window.location.reload()
    }
  }

  socket.addEventListener('message', handler)

  return (
    <AppDevOverlayErrorBoundary
      globalError={[GlobalError, null]}
      onError={noop}
    >
      {reactEl}
    </AppDevOverlayErrorBoundary>
  )
}
