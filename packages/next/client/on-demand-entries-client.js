/* global window, location */

import Router from 'next/router'
import fetch from 'unfetch'

let currentPage
const pingEvents = new Set()
pingEvents.add(JSON.stringify({success: true}))
pingEvents.add(JSON.stringify({invalid: true}))

export default async () => {
  Router.ready(() => {
    Router.events.on('routeChangeComplete', setupPing)
  })

  function setupPing () {
    // Make sure to only create new EventSource request if page has changed
    if (Router.pathname === currentPage) return
    currentPage = Router.pathname
    window.__NEXT_RES_EVT_SOURCE(currentPage)
  }

  // Set up ping handle to be called on EventSource message
  window.__NEXT_PING_HANDLE = event => {
    if (pingEvents.has(event.data)) {
      const payload = JSON.parse(event.data)
      if (payload.invalid) {
        // Payload can be invalid even if the page does not exist.
        // So, we need to make sure it exists before reloading.
        fetch(location.href, {
          credentials: 'same-origin'
        }).then(pageRes => {
          if (pageRes.status === 200) {
            location.reload()
          }
        })
      }
      // Let EventSource know we handled it
      return true
    }
  }

  setupPing(currentPage)
}
