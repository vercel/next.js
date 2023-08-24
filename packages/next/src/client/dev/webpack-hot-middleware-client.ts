import connect from './error-overlay/hot-dev-client'
import { sendMessage } from './error-overlay/websocket'

export default () => {
  const devClient = connect()

  devClient.subscribeToHmrEvent((obj: any) => {
    // if we're on an error/404 page, we can't reliably tell if the newly added/removed page
    // matches the current path. In that case, assume any added/removed entries should trigger a reload of the current page
    const isOnErrorPage =
      window.next.router.pathname === '/404' ||
      window.next.router.pathname === '/_error'

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
      if (page === window.next.router.pathname || isOnErrorPage) {
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
        (page === window.next.router.pathname &&
          typeof window.next.router.components[page] === 'undefined') ||
        isOnErrorPage
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
    if (
      obj.action === 'serverError' ||
      obj.action === 'devPagesManifestUpdate'
    ) {
      return
    }
    throw new Error('Unexpected action ' + obj.action)
  })

  return devClient
}
