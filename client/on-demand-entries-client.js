/* global location */

import Router from '../lib/router'
import fetch from 'unfetch'

export default () => {
  Router.ready(() => {
    Router.router.events.on('routeChangeComplete', ping)
  })

  async function ping () {
    try {
      const url = `/_next/on-demand-entries-ping?page=${Router.pathname}`
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

  async function runPinger () {
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
      await ping()
    }
  }

  runPinger()
    .catch((err) => {
      console.error(err)
    })
}
