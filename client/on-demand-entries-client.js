/* global location */

import Router from '../lib/router'
import fetch from 'unfetch'

const originalRouteChangeComplete = Router.onRouteChangeComplete
Router.onRouteChangeComplete = (...args) => {
  if (originalRouteChangeComplete) originalRouteChangeComplete(...args)
  ping()
}

async function ping () {
  try {
    const url = `/_next/on-demand-entries-ping?page=${Router.pathname}`
    const res = await fetch(url)
    const payload = await res.json()
    if (payload.invalid) {
      location.reload()
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
