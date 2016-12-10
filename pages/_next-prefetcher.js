/* global self */

var CACHE_NAME = 'next-prefetcher-v1'

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
      console.log('CACHING ', e.data.url)
      sendReply(e, cacheUrl(e.data.url))
      break
    }
    case 'RESET': {
      console.log('RESET')
      sendReply(e, resetCache())
      break
    }
    default:
      console.error('Unknown action: ' + e.data.action)
  }
})

function sendReply (e, result) {
  var payload = { action: 'REPLY', actionType: e.data.action, replyFor: e.data.id }
  result
    .then(function (result) {
      payload.result = result
      e.source.postMessage(payload)
    })
    .catch(function (error) {
      payload.error = error.message
      e.source.postMessage(payload)
    })
}

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
        return cache.delete(item)
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
