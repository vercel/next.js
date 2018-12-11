/* global location, WebSocket */

import Router from 'next/router'
import fetch from 'unfetch'

const { protocol, hostname, port } = location
const url = `${protocol === 'http:' ? 'ws' : 'wss'}://${hostname}:${port}`
let ws = null
let lastHref = null

export default async ({ assetPrefix }) => {
  Router.ready(() => {
    Router.events.on('routeChangeComplete', ping)
  })

  const setup = async () => {
    if (ws && ws.readyState === ws.OPEN) {
      return Promise.resolve()
    }
    return new Promise(resolve => {
      ws = new WebSocket(`${url}${assetPrefix}/_next/on-demand-entries-ping`)
      ws.onopen = () => resolve()
      ws.onclose = () => {
        setTimeout(async () => {
          await setup()
          resolve()
        }, 5000)
      }
      ws.onmessage = async ({ data }) => {
        const payload = JSON.parse(data)
        if (payload.invalid && lastHref !== location.href) {
          // Payload can be invalid even if the page does not exist.
          // So, we need to make sure it exists before reloading.
          const pageRes = await fetch(location.href, {
            credentials: 'omit'
          })
          if (pageRes.status === 200) {
            location.reload()
          } else {
            lastHref = location.href
          }
        }
      }
    })
  }
  await setup()

  async function ping () {
    if (ws.readyState === ws.OPEN) {
      ws.send(Router.pathname)
    }
  }

  let pingerTimeout
  async function runPinger () {
    // Will restart on the visibilitychange API below. For older browsers, this
    // will always be true and will always run, but support is fairly prevalent
    // at this point.
    while (!document.hidden) {
      await ping()
      await new Promise(resolve => {
        pingerTimeout = setTimeout(resolve, 5000)
      })
    }
  }

  document.addEventListener(
    'visibilitychange',
    () => {
      if (!document.hidden) {
        runPinger()
      } else {
        clearTimeout(pingerTimeout)
      }
    },
    false
  )

  setTimeout(() => {
    runPinger().catch(err => {
      console.error(err)
    })
  }, 10000)
}
