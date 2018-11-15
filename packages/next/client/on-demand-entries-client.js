/* global location */

import Router from 'next-server/router'
import fetch from 'unfetch'

export default ({assetPrefix}) => {
  Router.ready(() => {
    Router.events.on('routeChangeComplete', ping)
  })

  async function ping () {
    try {
      const url = `${assetPrefix || ''}/_next/on-demand-entries-ping?page=${Router.pathname}`
      const res = await fetch(url, {
        credentials: 'same-origin'
      })
      const payload = await res.json()
      if (payload.invalid) {
        // Payload can be invalid even if the page is not exists.
        // So, we need to make sure it's exists before reloading.
        const pageRes = await fetch(location.href, {
          credentials: 'same-origin'
        })
        if (pageRes.status === 200) {
          location.reload()
        }
      }
    } catch (err) {
      console.error(`Error with on-demand-entries-ping: ${err.message}`)
    }
  }

  let pingerTimeout
  async function runPinger () {
    // Will restart on the visibilitychange API below. For older browsers, this
    // will always be true and will always run, but support is fairly prevalent
    // at this point.
    while (!document.hidden) {
      await ping()
      await new Promise((resolve) => {
        pingerTimeout = setTimeout(resolve, 5000)
      })
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      runPinger()
    } else {
      clearTimeout(pingerTimeout)
    }
  }, false)

  setTimeout(() => {
    runPinger()
      .catch((err) => {
        console.error(err)
      })
  }, 10000)
}
