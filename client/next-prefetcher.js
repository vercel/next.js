/* global self */

const CACHE_NAME = 'next-prefetcher-v1'
const log = () => {}

self.addEventListener('install', () => {
  log('Installing Next Prefetcher')
})

self.addEventListener('activate', (e) => {
  log('Activated Next Prefetcher')
  e.waitUntil(Promise.all([
    resetCache(),
    notifyClients()
  ]))
})

self.addEventListener('fetch', (e) => {
  for (const a of e.request.headers.getAll('accept')) {
    // bypass Server Sent Events
    if (a === 'text/event-stream') return
  }

  e.respondWith(getResponse(e.request))
})

self.addEventListener('message', (e) => {
  switch (e.data.action) {
    case 'ADD_URL': {
      log('CACHING ', e.data.url)
      sendReply(e, cacheUrl(e.data.url))
      break
    }
    case 'RESET': {
      log('RESET')
      sendReply(e, resetCache())
      break
    }
    default:
      console.error('Unknown action: ' + e.data.action)
  }
})

function sendReply (e, result) {
  const payload = { action: 'REPLY', actionType: e.data.action, replyFor: e.data.id }
  result
    .then((result) => {
      payload.result = result
      e.source.postMessage(payload)
    })
    .catch((error) => {
      payload.error = error.message
      e.source.postMessage(payload)
    })
}

function cacheUrl (url) {
  const req = new self.Request(url, {
    mode: 'no-cors',
    headers: {
      'Accept': 'application/json'
    }
  })

  return self.caches.open(CACHE_NAME)
    .then((cache) => {
      return self.fetch(req)
        .then((res) => cache.put(req, res))
    })
}

function getResponse (req) {
  return self.caches.open(CACHE_NAME)
    .then((cache) => cache.match(req))
    .then((res) => {
      if (res) {
        log('CACHE HIT: ' + req.url)
        return res
      } else {
        log('CACHE MISS: ' + req.url)
        return self.fetch(req)
      }
    })
}

function resetCache () {
  let cache

  return self.caches.open(CACHE_NAME)
    .then((c) => {
      cache = c
      return cache.keys()
    })
    .then(function (items) {
      const deleteAll = items.map((item) => cache.delete(item))
      return Promise.all(deleteAll)
    })
}

function notifyClients () {
  return self.clients.claim()
    .then(() => self.clients.matchAll())
    .then((clients) => {
      const notifyAll = clients.map((client) => {
        return client.postMessage({ action: 'NEXT_PREFETCHER_ACTIVATED' })
      })
      return Promise.all(notifyAll)
    })
}
