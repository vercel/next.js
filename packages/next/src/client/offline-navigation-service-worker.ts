import { getDeploymentIdQuery } from '../shared/lib/deployment-id'
import { OFFLINE_NAVIGATION_FALLBACK_SERVED } from '../shared/lib/offline-navigation-constants'

const OFFLINE_NAVIGATION_SERVICE_WORKER =
  '_offline-navigation-service-worker.js'

let isListeningForServiceWorkerMessages = false

type OfflineNavigationFallbackServedMessage = {
  type: typeof OFFLINE_NAVIGATION_FALLBACK_SERVED
  buildId?: string
  reason?: 'network-error'
  url?: string
}

function getBasePath(): string {
  return (process.env.__NEXT_ROUTER_BASEPATH as string) || ''
}

function getServiceWorkerHref(): string {
  return `${getBasePath()}/_next/static/${OFFLINE_NAVIGATION_SERVICE_WORKER}${getDeploymentIdQuery()}`
}

function getServiceWorkerScope(): string {
  const basePath = getBasePath()
  return basePath ? `${basePath}/` : '/'
}

function listenForOfflineNavigationMessages(): void {
  if (isListeningForServiceWorkerMessages) {
    return
  }
  isListeningForServiceWorkerMessages = true

  navigator.serviceWorker.addEventListener('message', (event) => {
    handleOfflineNavigationServiceWorkerMessage(event.data)
  })
}

export function handleOfflineNavigationServiceWorkerMessage(data: unknown) {
  if (!isOfflineNavigationFallbackServedMessage(data)) {
    return
  }

  const { notifyOffline } =
    require('./components/offline') as typeof import('./components/offline')
  notifyOffline()
}

function isOfflineNavigationFallbackServedMessage(
  data: unknown
): data is OfflineNavigationFallbackServedMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as Partial<OfflineNavigationFallbackServedMessage>).type ===
      OFFLINE_NAVIGATION_FALLBACK_SERVED
  )
}

export function registerOfflineNavigationServiceWorker(): void {
  if (
    process.env.__NEXT_DEV_SERVER ||
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    !('serviceWorker' in navigator)
  ) {
    return
  }

  listenForOfflineNavigationMessages()

  navigator.serviceWorker
    .register(getServiceWorkerHref(), {
      scope: getServiceWorkerScope(),
      updateViaCache: 'none',
    })
    .catch(() => {})
}
