import React from 'react'
import ReactDevOverlay from './react-dev-overlay'
import { getSocketUrl } from '../internal/helpers/get-socket-url'
import { INITIAL_OVERLAY_STATE } from '../shared'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../../../../server/dev/hot-reloader-types'
import GlobalError from '../../error-boundary'

// if an error is thrown while rendering an RSC stream, this will catch it in dev
// and show the error overlay
export function createRootLevelDevOverlayElement(reactEl: React.ReactElement) {
  const rootLayoutMissingTags = window.__next_root_layout_missing_tags
  const hasMissingTags = !!rootLayoutMissingTags?.length
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

  const FallbackLayout = hasMissingTags
    ? ({ children }: { children: React.ReactNode }) => (
        <html id="__next_error__">
          <body>{children}</body>
        </html>
      )
    : React.Fragment

  return (
    <FallbackLayout>
      <ReactDevOverlay
        state={{ ...INITIAL_OVERLAY_STATE, rootLayoutMissingTags }}
        globalError={[GlobalError, null]}
      >
        {reactEl}
      </ReactDevOverlay>
    </FallbackLayout>
  )
}
