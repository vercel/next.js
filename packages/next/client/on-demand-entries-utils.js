/* global window, location */

import fetch from 'unfetch'

let evtSource
export let currentPage
let retryTimeout
const retryWait = 5000

export function setupPing (assetPrefix, pathnameFn, retry) {
  const pathname = pathnameFn()

  // Make sure to only create new EventSource request if page has changed
  if (pathname === currentPage && !retry) return
  // close current EventSource connection
  if (evtSource) {
    evtSource.close()
  }
  currentPage = pathname

  const url = `${assetPrefix}/_next/on-demand-entries-ping?page=${currentPage}`
  evtSource = new window.EventSource(url)

  evtSource.onerror = () => {
    retryTimeout = setTimeout(
      () => setupPing(assetPrefix, pathnameFn, true),
      retryWait
    )
  }

  evtSource.onopen = () => {
    clearTimeout(retryTimeout)
  }

  evtSource.onmessage = event => {
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
  }
}
