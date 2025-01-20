import type {
  NextRouter,
  PrivateRouteInfo,
} from '../../shared/lib/router/router'
import connect from '../components/react-dev-overlay/pages/hot-reloader-client'
import { sendMessage } from '../components/react-dev-overlay/pages/websocket'

// Define a local type for the window.next object
interface NextWindow {
  next?: {
    router?: NextRouter & {
      components: { [pathname: string]: PrivateRouteInfo }
    }
  }
  __nextDevClientId?: string
  location: Location
}

declare const window: NextWindow

let reloading = false

export default (mode: 'webpack' | 'turbopack') => {
  const devClient = connect(mode)

  devClient.subscribeToHmrEvent((obj: any) => {
    if (reloading) return

    // Retrieve the router if it's available
    const router = window.next?.router

    // Determine if we're on an error page or the router is not initialized
    const isOnErrorPage =
      !router || router.pathname === '/404' || router.pathname === '/_error'

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

        // Check if the removed page is the current page
        const isCurrentPage = page === router?.pathname

        // We enter here if the removed page is currently being viewed
        // or if we happen to be on an error page.
        if (isCurrentPage || isOnErrorPage) {
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

        // Check if the added page is the current page
        const isCurrentPage = page === router?.pathname

        // Check if the page component is not yet loaded
        const isPageNotLoaded =
          typeof router?.components?.[page] === 'undefined'

        // We enter this block if the newly added page is the one currently being viewed
        // but hasn't been loaded yet, or if we're on an error page.
        if ((isCurrentPage && isPageNotLoaded) || isOnErrorPage) {
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
      case 'appIsrManifest':
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
