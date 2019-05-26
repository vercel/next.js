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

  document.addEventListener('visibilitychange', event => {
    const state = document.visibilityState
    if (state === 'visible') {
      setupPing(assetPrefix, () => Router.pathname, true)
    } else {
      closePing()
    }
  })
}
