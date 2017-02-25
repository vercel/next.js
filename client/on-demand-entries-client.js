/* global fetch, location, WebSocket */

import Router from '../lib/router'
import 'whatwg-fetch'

initiatePinging()
  .catch((err) => {
    console.error(err.stack)
  })

async function initiatePinging () {
  const res = await fetch('/on-demand-entries-pinger-port')
  const payload = await res.json()
  startPinging(payload.port)
}

async function retry () {
  while (true) {
    try {
      await initiatePinging()
      break
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
}

function startPinging (port) {
  const conn = new WebSocket(`ws://localhost:${port}/`, 'protocolOne')
  let pingingHandler = null
  conn.onopen = () => {
    console.log('> Start pinging for the active page.')
    ping()
    pingingHandler = setInterval(ping, 1000 * 5)
  }

  conn.onmessage = (event) => {
    const parsedMessage = JSON.parse(event.data)
    if (parsedMessage.invalid) {
      location.reload()
    }
  }

  conn.onclose = () => {
    clearInterval(pingingHandler)
    retry()
  }

  conn.onerror = (error) => {
    console.log(`Pinger error: ${error.message}`)
  }

  // Ping on every page change
  const originalOnRouteChangeComplete = Router.onRouteChangeComplete
  Router.onRouteChangeComplete = function (...args) {
    ping()
    if (originalOnRouteChangeComplete) originalOnRouteChangeComplete(...args)
  }

  function ping () {
    const payload = { page: Router.pathname }
    conn.send(JSON.stringify(payload))
  }
}
