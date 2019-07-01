/* global window, location */

import fetch from 'unfetch'
import { getEventSourceWrapper } from './error-overlay/eventsource'

let evtSource
export let currentPage

export function closePing () {
  if (evtSource) evtSource.close()
  evtSource = null
}

export function setupPing (assetPrefix, pathnameFn, retry) {
  const pathname = pathnameFn()

  // Make sure to only create new EventSource request if page has changed
  if (pathname === currentPage && !retry) return
  currentPage = pathname
  // close current EventSource connection
  closePing()

  const url = `${assetPrefix}/_next/webpack-hmr?page=${currentPage}`
  evtSource = getEventSourceWrapper({ path: url, timeout: 5000, ondemand: 1 })

  evtSource.addMessageListener(event => {
    if (event.data.indexOf('{') === -1) return
    try {
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
    } catch (err) {
      console.error('on-demand-entries failed to parse response', err)
    }
  })
}
