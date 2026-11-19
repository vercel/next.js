import { getSocketUrl } from './dev/hot-reloader/get-socket-url'
import { HMR_MESSAGE_SENT_TO_BROWSER } from '../server/dev/hot-reloader-types'

// Go owns the document, so browser changes replace the document. No React router
// or hydration bootstrap is required for a native route.
let sessionId: number | null = null

function connect() {
  const socket = new WebSocket(
    `${getSocketUrl(process.env.__NEXT_ASSET_PREFIX)}/_next/hmr`
  )
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.type === HMR_MESSAGE_SENT_TO_BROWSER.TURBOPACK_CONNECTED) {
      if (sessionId !== null && sessionId !== message.data.sessionId) {
        window.location.reload()
      }
      sessionId = message.data.sessionId
    }
    if (
      message.type === HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES ||
      message.type === HMR_MESSAGE_SENT_TO_BROWSER.RELOAD_PAGE
    ) {
      window.location.reload()
    }
  }
  socket.onclose = () => setTimeout(connect, 1000)
  socket.onerror = () => socket.close()
}
connect()
