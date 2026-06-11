// Service-worker entry. The whole transitive closure — including the dynamic
// `import('./sw-helper')` — must be inlined into a single self-contained bundle
// served at /service-worker.js.
//
// The project is type-checked with the DOM lib (not webworker), so we access the
// service-worker globals through an `any` view of `self` rather than redeclaring
// it or pulling in conflicting lib types.
const sw = self as any

import('./sw-helper').then(({ greeting }) => {
  console.log(greeting())
})

sw.addEventListener('install', () => {
  sw.skipWaiting()
})

sw.addEventListener('activate', (event: any) => {
  event.waitUntil(sw.clients.claim())
})

sw.addEventListener('fetch', (event: any) => {
  // Intercept a sentinel request so the test can prove the SW is in control.
  const url = new URL(event.request.url)
  if (url.pathname === '/__sw_intercepted__') {
    event.respondWith(
      new Response('intercepted-by-service-worker', {
        headers: { 'content-type': 'text/plain' },
      })
    )
  }
})
