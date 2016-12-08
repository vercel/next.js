/* global self */

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

function resetCache () {
  return self.caches
    .keys()
    .then(function (items) {
      var deleteAll = items.map(function (item) {
        return self.caches.delete(items)
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
        return client.postMessage('NEXT_PREFETCHER_ACTIVATED')
      })
      return Promise.all(notifyAll)
    })
}
