/* global self */

var CACHE_NAME = 'next-prefetcher-v2'

self.addEventListener('install', function (event) {
  console.log('Installing Next Prefetcher')
})

self.addEventListener('activate', function (e) {
  console.log('Activated Next Prefetcher')
  e.waitUntil(Promise.all([
    resetCache(),
    notifyClients()
  ]))
})

self.addEventListener('fetch', function (e) {
  e.respondWith(getResponse(e.request))
})

self.addEventListener('message', function handler (e) {
  switch (e.data.action) {
    case 'ADD_URL': {
      cacheUrl(e.data.url)
        .then(function () {
          e.ports[0].postMessage({ action: 'URL_ADDED', url: e.data.url })
        })
        .catch(function (err) {
          e.ports[0].postMessage({ action: 'URL_ADD_ERROR', error: err.message })
        })

      break
    }
    default:
      console.error('Unknown action: ' + e.data.action)
  }
})

function cacheUrl (url) {
  var req = new self.Request(url, {
    mode: 'no-cors'
  })

  return self.caches.open(CACHE_NAME)
    .then(function (cache) {
      return self.fetch(req)
        .then(function (res) {
          return cache.put(req, res)
        })
    })
}

function getResponse (req) {
  return self.caches.open(CACHE_NAME)
    .then(function (cache) {
      return cache.match(req)
    })
    .then(function (res) {
      if (res) {
        console.log('CACHE HIT: ' + req.url)
        return res
      } else {
        console.log('CACHE MISS: ' + req.url)
        return self.fetch(req)
      }
    })
}

function resetCache () {
  var cache

  return self.caches.open(CACHE_NAME)
    .then(function (c) {
      cache = c
      return cache.keys()
    })
    .then(function (items) {
      var deleteAll = items.map(function (item) {
        return cache.delete(items)
      })
      return Promise.all(deleteAll)
    })
}

function notifyClients () {
  return self.clients.claim()
    .then(function () {
      return self.clients.matchAll()
    })
    .then(function (clients) {
      var notifyAll = clients.map(function (client) {
        return client.postMessage({ action: 'NEXT_PREFETCHER_ACTIVATED' })
      })
      return Promise.all(notifyAll)
    })
}
