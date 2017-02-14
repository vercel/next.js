/* global fetch */

import Router from '../lib/router'
import 'whatwg-fetch'

// Ping on every page change
const originalOnRouteChangeComplete = Router.onRouteChangeComplete
Router.onRouteChangeComplete = function (...args) {
  ping()
  originalOnRouteChangeComplete(...args)
}

// Ping every 5 seconds
setInterval(ping, 5000)

function ping () {
  const url = `/on-demand-entries-ping?page=${Router.pathname}`
  fetch(url)
    .catch((err) => {
      console.error(`Error with on-demand-entries-ping: ${err.message}`)
    })
}
