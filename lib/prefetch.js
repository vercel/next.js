import React from 'react'
import Link, { isLocal } from './link'

const PREFETCHED_URLS = {}

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
  // TODO: Wait until resetting

  let pathname = getPathname(href)
  // Add support for the index page
  if (pathname === '/') {
    pathname = '/index'
  }

  const url = `${pathname}.json`
  if (PREFETCHED_URLS[url]) return

  const message = { action: 'ADD_URL', url: url }
  navigator.serviceWorker.controller.postMessage(message)
  PREFETCHED_URLS[url] = true
}

function reset () {
  if (noServiceWorkerSupport()) return
  const message = { action: 'RESET' }
  navigator.serviceWorker.controller.postMessage(message)
}

async function register () {
  if (noServiceWorkerSupport()) return
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
  reset()
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

// Since service workers has a lifetime beyond the web page. There's no need
// wait for the load event.
// Even if we do so, in the next time we load the page, service worker
// will start it's job since it's already running and activated.
register()
