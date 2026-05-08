import { getDeploymentIdQuery } from '../shared/lib/deployment-id'

const OFFLINE_NAVIGATION_SERVICE_WORKER =
  '_offline-navigation-service-worker.js'

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

export function registerOfflineNavigationServiceWorker(): void {
  if (
    process.env.__NEXT_DEV_SERVER ||
    typeof window === 'undefined' ||
    !window.isSecureContext ||
    !('serviceWorker' in navigator)
  ) {
    return
  }

  navigator.serviceWorker
    .register(getServiceWorkerHref(), {
      scope: getServiceWorkerScope(),
      updateViaCache: 'none',
    })
    .catch(() => {})
}
