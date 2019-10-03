/* global window */

import Router from 'next/router'
import { setupPing, currentPage, closePing } from './on-demand-entries-utils'

export default async ({ assetPrefix }) => {
  Router.ready(() => {
    Router.events.on(
      'routeChangeComplete',
      setupPing.bind(this, assetPrefix, () => Router.pathname)
    )
  })

  setupPing(assetPrefix, () => Router.pathname, currentPage)

  // prevent HMR connection from being closed when running tests
  if (!process.env.__NEXT_TEST_MODE) {
    document.addEventListener('visibilitychange', event => {
      const state = document.visibilityState
      if (state === 'visible') {
        setupPing(assetPrefix, () => Router.pathname, true)
      } else {
        closePing()
      }
    })
  }
}
