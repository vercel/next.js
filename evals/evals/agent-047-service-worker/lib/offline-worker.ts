/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(
      () => new Response('You are offline', { status: 503 })
    )
  )
})

export {}
