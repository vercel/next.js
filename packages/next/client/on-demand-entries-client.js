/* global window */

import Router from 'next/router'
import { setupPing, currentPage } from './on-demand-entries-utils'

export default async ({ assetPrefix }) => {
  Router.ready(() => {
    Router.events.on(
      'routeChangeComplete',
      setupPing.bind(this, assetPrefix, () => Router.pathname)
    )
  })

  setupPing(assetPrefix, () => Router.pathname, currentPage)
}
