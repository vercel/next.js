/* global window */

import Router from 'next/router'
import { setupPing, currentPage } from './on-demand-entries-utils'

export default async ({ assetPrefix }) => {
  Router.ready(() => {
    Router.events.on('routeChangeComplete', setupPing)
  })

  setupPing(assetPrefix, () => Router.pathname, currentPage)
}
