/* global fetch, location */

import Router from '../lib/router'
import 'whatwg-fetch'

// Ping on every page change
const originalOnRouteChangeComplete = Router.onRouteChangeComplete
Router.onRouteChangeComplete = function (...args) {
  ping()
  if (originalOnRouteChangeComplete) originalOnRouteChangeComplete(...args)
}

// Ping every 3 seconds
setInterval(ping, 3000)

function ping () {
  const url = `/on-demand-entries-ping?page=${Router.pathname}`
  fetch(url)
    .then((res) => {
      return res.json()
    })
    .then((payload) => {
      if (payload.invalid) {
        location.reload()
      }
    })
    .catch((err) => {
      console.error(`Error with on-demand-entries-ping: ${err.message}`)
    })
}
