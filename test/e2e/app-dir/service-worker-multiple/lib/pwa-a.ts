declare const self: ServiceWorkerGlobalScope
self.addEventListener('install', () => self.skipWaiting())
export {}
