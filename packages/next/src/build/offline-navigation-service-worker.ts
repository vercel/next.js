import path from 'node:path'

import { CLIENT_STATIC_FILES_PATH } from '../shared/lib/constants'
import { OFFLINE_NAVIGATION_SERVICE_WORKER } from '../shared/lib/offline-navigation'

export function getOfflineNavigationServiceWorkerFilePath(): string {
  return path.join(CLIENT_STATIC_FILES_PATH, OFFLINE_NAVIGATION_SERVICE_WORKER)
}

function renderServiceWorkerMetadata(metadata: unknown): string {
  return `self.__NEXT_OFFLINE_NAVIGATION_SW=${JSON.stringify(metadata)};`
}

const serviceWorkerInstallListener =
  "self.addEventListener('install',(event)=>{event.waitUntil(self.skipWaiting())});"

const serviceWorkerActivateListener =
  "self.addEventListener('activate',(event)=>{event.waitUntil(self.clients.claim())});"

// Generate an app-local service worker for offline navigations. This slice is
// pass-through: it only installs and claims clients so later slices can add
// cache population and fallback document handling.
export function createOfflineNavigationServiceWorker(): string {
  const metadata = {
    source: 'offline-navigation-service-worker',
  }

  return [
    renderServiceWorkerMetadata(metadata),
    serviceWorkerInstallListener,
    serviceWorkerActivateListener,
  ].join('')
}
