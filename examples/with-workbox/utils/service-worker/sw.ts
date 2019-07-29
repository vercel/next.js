declare var self: ServiceWorkerGlobalScope
export {}

declare global {
  interface ServiceWorkerGlobalScope {
    __WB_MANIFEST: Array<{
      revision?: string
      url: string
    }>
  }
}

// @ts-ignore
import { precacheAndRoute } from 'workbox-precaching/precacheAndRoute.mjs'

self.addEventListener('message', event => {
  if (!event.data || !event.data.type) return
  const port = event.ports[0]
  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break
    case 'CLIENTS_COUNT':
      self.clients.matchAll().then(allClients => {
        port.postMessage(allClients.length)
      })
      break
  }
})

precacheAndRoute(self.__WB_MANIFEST, {})
