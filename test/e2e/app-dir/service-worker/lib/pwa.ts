/// <reference lib="webworker" />
// A minimal service worker used to verify that
// `navigator.serviceWorker.register(new URL(...))` is compiled and served
// correctly. It claims clients immediately and intercepts a sentinel request.
declare const self: ServiceWorkerGlobalScope

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname === '/sw-intercepted') {
    event.respondWith(
      new Response('intercepted-by-sw', {
        headers: { 'content-type': 'text/plain' },
      })
    )
  }
})

export {}
