/* global location */
import { getEventSourceWrapper } from './error-overlay/eventsource'

let evtSource
export let currentPage

export function closePing() {
  if (evtSource) evtSource.close()
  evtSource = null
}

export function setupPing(assetPrefix, pathnameFn, retry) {
  const pathname = pathnameFn()

  // Make sure to only create new EventSource request if page has changed
  if (pathname === currentPage && !retry) return
  currentPage = pathname
  // close current EventSource connection
  closePing()

  evtSource = getEventSourceWrapper({
    path: `${assetPrefix}/_next/webpack-hmr?page=${encodeURIComponent(
      currentPage
    )}`,
    timeout: 5000,
  })

  evtSource.addMessageListener((event) => {
    if (event.data.indexOf('{') === -1) return
    try {
      const payload = JSON.parse(event.data)
      // don't attempt fetching the page if we're already showing
      // the dev overlay as this can cause the error to be triggered
      // repeatedly
      if (payload.invalid && !self.__NEXT_DATA__.err) {
        // Payload can be invalid even if the page does not exist.
        // So, we need to make sure it exists before reloading.
        fetch(location.href, {
          credentials: 'same-origin',
        }).then((pageRes) => {
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
