/* global location, WebSocket */

import Router from 'next/router'
import fetch from 'unfetch'

const { hostname, protocol } = location
const wsProtocol = protocol.includes('https') ? 'wss' : 'ws'
const retryTime = 5000
let ws = null
let lastHref = null
let wsConnectTries = 0
let showedWarning = false

export default async ({ assetPrefix }) => {
  Router.ready(() => {
    Router.events.on('routeChangeComplete', ping)
  })

  const setup = async () => {
    if (ws && ws.readyState === ws.OPEN) {
      return Promise.resolve()
    } else if (wsConnectTries > 1) {
      return
    }
    wsConnectTries++

    return new Promise(resolve => {
      ws = new WebSocket(`${wsProtocol}://${hostname}:${process.env.__NEXT_WS_PORT}${process.env.__NEXT_WS_PROXY_PATH}`)
      ws.onopen = () => {
        wsConnectTries = 0
        resolve()
      }
      ws.onclose = () => {
        setTimeout(async () => {
          await fetch(`${assetPrefix}/_next/on-demand-entries-ping`)
            .then(res => {
              // Only reload if next was restarted and we have a new WebSocket port
              if (res.status === 200 && res.headers.get('port') !== process.env.__NEXT_WS_PORT + '') {
                location.reload()
              }
            })
            .catch(() => {})
          await setup(true)
          resolve()
        }, retryTime)
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
  setup()

  async function ping () {
    // Use WebSocket if available
    if (ws && ws.readyState === ws.OPEN) {
      return ws.send(Router.pathname)
    }
    if (!showedWarning) {
      console.warn('onDemandEntries WebSocket failed to connect, falling back to fetch based pinging. https://err.sh/zeit/next.js/on-demand-entries-websocket-unavailable')
      showedWarning = true
    }
    // If not, fallback to fetch based pinging
    try {
      const url = `${assetPrefix || ''}/_next/on-demand-entries-ping?page=${Router.pathname}`
      const res = await fetch(url, {
        credentials: 'same-origin'
      })
      const payload = await res.json()
      if (payload.invalid) {
        // Payload can be invalid even if the page does not exist.
        // So, we need to make sure it exists before reloading.
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
