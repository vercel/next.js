import path from 'node:path'

import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'
import { OFFLINE_NAVIGATION_SERVICE_WORKER } from '../shared/lib/offline-navigation'

export function getOfflineNavigationServiceWorkerFilePath(): string {
  return path.join(CLIENT_STATIC_FILES_PATH, OFFLINE_NAVIGATION_SERVICE_WORKER)
}

export function createOfflineNavigationServiceWorker({
  buildId,
  manifestHref,
}: {
  buildId: string
  manifestHref: string
}): string {
  const metadata = JSON.stringify({
    buildId,
    manifestHref,
    source: 'offline-navigation-service-worker',
  })

  return `self.__NEXT_OFFLINE_NAVIGATION_SW=${metadata};
self.addEventListener('install',(event)=>{event.waitUntil(self.skipWaiting())});
self.addEventListener('activate',(event)=>{event.waitUntil(self.clients.claim())});
`
}
