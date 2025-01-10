import Router from '../router'
import { sendMessage } from '../components/react-dev-overlay/pages/websocket'

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
}
