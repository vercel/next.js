import connect from './error-overlay/hot-dev-client'
import { sendMessage } from './error-overlay/websocket'

let reloading = false

export default (mode: 'webpack' | 'turbopack') => {
  const devClient = connect(mode)

  devClient.subscribeToHmrEvent((obj: any) => {
    if (reloading) return
    // if we're on an error/404 page, we can't reliably tell if the newly added/removed page
    // matches the current path. In that case, assume any added/removed entries should trigger a reload of the current page
    const isOnErrorPage =
      window.next.router.pathname === '/404' ||
      window.next.router.pathname === '/_error'

    switch (obj.action) {
      case 'reloadPage': {
        sendMessage(
          JSON.stringify({
            event: 'client-reload-page',
            clientId: window.__nextDevClientId,
          })
        )
        reloading = true
        return window.location.reload()
      }
      case 'removedPage': {
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
      case 'addedPage': {
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
      case 'serverError':
      case 'devPagesManifestUpdate':
      case 'building':
      case 'finishBuilding': {
        return
      }
      default: {
        throw new Error('Unexpected action ' + obj.action)
      }
    }
  })

  return devClient
}
