/* global __NEXT_DATA__ */

import React from 'react'
import Link, { isLocal } from './link'
import { parse as urlParse } from 'url'

class Messenger {
  constructor () {
    this.id = 0
    this.callacks = {}
    this.serviceWorkerReadyCallbacks = []
    this.serviceWorkerState = null

    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data.action !== 'REPLY') return
      if (this.callacks[data.replyFor]) {
        this.callacks[data.replyFor](data)
      }
    })

    // Reset the cache always.
    // Sometimes, there's an already running service worker with cached requests.
    // If the app doesn't use any prefetch calls, `ensureInitialized` won't get
    // called and cleanup resources.
    // So, that's why we do this.
    this._resetCache()
  }

  send (payload) {
    return new Promise((resolve, reject) => {
      if (this.serviceWorkerState === 'REGISTERED') {
        this._send(payload, handleCallback)
      } else {
        this.serviceWorkerReadyCallbacks.push(() => {
          this._send(payload, handleCallback)
        })
      }

      function handleCallback (err) {
        if (err) return reject(err)
        return resolve()
      }
    })
  }

  _send (payload, cb = () => {}) {
    const id = this.id ++
    const newPayload = { ...payload, id }

    this.callacks[id] = (data) => {
      if (data.error) {
        cb(data.error)
      } else {
        cb(null, data.result)
      }

      delete this.callacks[id]
    }

    navigator.serviceWorker.controller.postMessage(newPayload)
  }

  _resetCache (cb) {
    const reset = () => {
      this._send({ action: 'RESET' }, cb)
    }

    if (navigator.serviceWorker.controller) {
      reset()
    } else {
      navigator.serviceWorker.oncontrollerchange = reset
    }
  }

  ensureInitialized () {
    if (this.serviceWorkerState) {
      return
    }

    this.serviceWorkerState = 'REGISTERING'
    navigator.serviceWorker.register('/_next-prefetcher.js')

    // Reset the cache after registered
    // We don't need to have any old caches since service workers lives beyond
    // life time of the webpage.
    // With this prefetching won't work 100% if multiple pages of the same app
    // loads in the same browser in same time.
    // Basically, cache will only have prefetched resourses for the last loaded
    // page of a given app.
    // We could mitigate this, when we add a hash to a every file we fetch.
    this._resetCache((err) => {
      if (err) throw err
      this.serviceWorkerState = 'REGISTERED'
      this.serviceWorkerReadyCallbacks.forEach(cb => cb())
      this.serviceWorkerReadyCallbacks = []
    })
  }
}

function hasServiceWorkerSupport () {
  return (typeof navigator !== 'undefined' && navigator.serviceWorker)
}

const PREFETCHED_URLS = {}
let messenger

if (hasServiceWorkerSupport()) {
  messenger = new Messenger()
}

function getPrefetchUrl (href) {
  let { pathname } = urlParse(href)
  const url = `/_next/${__NEXT_DATA__.buildId}/pages${pathname}`

  return url
}

export async function prefetch (href) {
  if (!hasServiceWorkerSupport()) return
  if (!isLocal(href)) return

  // Register the service worker if it's not.
  messenger.ensureInitialized()

  const url = getPrefetchUrl(href)
  if (!PREFETCHED_URLS[url]) {
    PREFETCHED_URLS[url] = messenger.send({ action: 'ADD_URL', url: url })
  }

  return PREFETCHED_URLS[url]
}

export async function reloadIfPrefetched (href) {
  const url = getPrefetchUrl(href)
  if (!PREFETCHED_URLS[url]) return

  delete PREFETCHED_URLS[url]
  await prefetch(href)
}

export default class LinkPrefetch extends React.Component {
  render () {
    const { href } = this.props
    if (this.props.prefetch !== false) {
      prefetch(href)
    }

    return (<Link {...this.props} />)
  }
}
