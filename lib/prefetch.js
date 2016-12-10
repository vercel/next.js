import React from 'react'
import Link, { isLocal } from './link'

class Messenger {
  constructor () {
    this.id = 0
    this.callacks = {}
    this.serviceWorkerReadyCallbacks = []
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data.action !== 'REPLY') return
      if (this.callacks[data.replyFor]) {
        this.callacks[data.replyFor](data)
      }
    })
    this._register()
  }

  send (payload, cb) {
    if (this.serviceWorkerState === 'REGISTERED') {
      this._send(payload, cb)
    } else {
      this.serviceWorkerReadyCallbacks.push(() => {
        this._send(payload, cb)
      })
    }
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

  async _register () {
    this.serviceWorkerState = 'REGISTERING'
    await navigator.serviceWorker.register('/_next-prefetcher.js')
    console.log('Service Worker successfully registered')

    // Reset the cache after every page load.
    // We don't need to have any old caches since service workers lives beyond
    // life time of the webpage.
    // With this prefetching won't work 100% if multiple pages of the same app
    // loads in the same browser in same time.
    // Basically, cache will only have prefetched resourses for the last loaded
    // page of a given app.
    // We could mitigate this, when we add a hash to a every file we fetch.
    this._send({ action: 'RESET' }, (err) => {
      if (err) throw err
      this.serviceWorkerState = 'REGISTERED'
      this.serviceWorkerReadyCallbacks.forEach(cb => cb())
      this.serviceWorkerReadyCallbacks = []
    })
  }
}

const PREFETCHED_URLS = {}
let messenger

function noServiceWorkerSupport () {
  return (typeof navigator === 'undefined' || !navigator.serviceWorker)
}

function getPathname (href) {
  const parser = document.createElement('a')
  parser.href = href

  return parser.pathname
}

export function prefetch (href) {
  if (noServiceWorkerSupport()) return
  if (!isLocal(href)) return

  if (!messenger) {
    messenger = new Messenger()
  }

  let pathname = getPathname(href)
  // Add support for the index page
  if (pathname === '/') {
    pathname = '/index'
  }

  const url = `${pathname}.json`
  if (PREFETCHED_URLS[url]) return

  messenger.send({ action: 'ADD_URL', url: url })
  PREFETCHED_URLS[url] = true
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
