import connect from './error-overlay/hot-dev-client'
import { sendMessage } from './error-overlay/websocket'

export default () => {
  const devClient = connect()

  devClient.subscribeToHmrEvent((obj) => {
    if (obj.action === 'reloadPage') {
      sendMessage(
        JSON.stringify({
          event: 'client-reload-page',
          clientId: window.__nextDevClientId,
        })
      )
      return window.location.reload()
    }
    if (obj.action === 'removedPage') {
      const [page] = obj.data
      if (page === window.next.router.pathname) {
        sendMessage(
          JSON.stringify({
            event: 'client-removed-page',
            clientId: window.__nextDevClientId,
            page,
          })
        )
        return window.location.reload()
      }
      return
    }
    if (obj.action === 'addedPage') {
      const [page] = obj.data
      if (
        page === window.next.router.pathname &&
        typeof window.next.router.components[page] === 'undefined'
      ) {
        sendMessage(
          JSON.stringify({
            event: 'client-added-page',
            clientId: window.__nextDevClientId,
            page,
          })
        )
        return window.location.reload()
      }
      return
    }
    throw new Error('Unexpected action ' + obj.action)
  })

  return devClient
}
