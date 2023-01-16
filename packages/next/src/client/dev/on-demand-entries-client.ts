import Router from '../router'
import { addMessageListener, sendMessage } from './error-overlay/websocket'

export default async (page?: string) => {
  if (page) {
    // in AMP the router isn't initialized on the client and
    // client-transitions don't occur so ping initial page
    setInterval(() => {
      sendMessage(JSON.stringify({ event: 'ping', page }))
    }, 2500)
  } else {
    Router.ready(() => {
      setInterval(() => {
        // when notFound: true is returned we should use the notFoundPage
        // as the Router.pathname will point to the 404 page but we want
        // to ping the source page that returned notFound: true instead
        const notFoundSrcPage = self.__NEXT_DATA__.notFoundSrcPage
        const pathname =
          (Router.pathname === '/404' || Router.pathname === '/_error') &&
          notFoundSrcPage
            ? notFoundSrcPage
            : Router.pathname

        sendMessage(JSON.stringify({ event: 'ping', page: pathname }))
      }, 2500)
    })
  }

  addMessageListener((event) => {
    if (event.data.indexOf('{') === -1) return
    try {
      const payload = JSON.parse(event.data)
      // don't attempt fetching the page if we're already showing
      // the dev overlay as this can cause the error to be triggered
      // repeatedly
      if (
        payload.event === 'pong' &&
        payload.invalid &&
        !self.__NEXT_DATA__.err
      ) {
        // Payload can be invalid even if the page does exist.
        // So, we check if it can be created.
        fetch(location.href, {
          credentials: 'same-origin',
        }).then((pageRes) => {
          if (pageRes.status === 200) {
            // Page exists now, reload
            location.reload()
          } else {
            // Page doesn't exist
            if (
              self.__NEXT_DATA__.page === Router.pathname &&
              Router.pathname !== '/_error'
            ) {
              // We are still on the page,
              // reload to show 404 error page
              location.reload()
            }
          }
        })
      }
    } catch (err) {
      console.error('on-demand-entries failed to parse response', err)
    }
  })
}
