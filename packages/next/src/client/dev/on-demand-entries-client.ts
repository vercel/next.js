import Router from '../router'
import { sendMessage } from './hot-reloader/pages/websocket'

export default async () => {
  // Never send pings when using Turbopack as it's not used.
  // Pings were originally used to keep track of active routes in on-demand-entries with webpack.
  if (process.env.TURBOPACK) {
    return
  }

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
