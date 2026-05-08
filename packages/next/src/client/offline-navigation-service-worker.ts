import { getDeploymentIdQuery } from '../shared/lib/deployment-id'
import {
  OFFLINE_NAVIGATION_CACHE_STATIC_ASSETS,
  OFFLINE_NAVIGATION_SERVICE_WORKER,
} from '../shared/lib/offline-navigation-constants'

let isSyncingCurrentStaticAssets = false

type OfflineNavigationCacheStaticAssetsMessage = {
  type: typeof OFFLINE_NAVIGATION_CACHE_STATIC_ASSETS
  hrefs: string[]
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

function isNextStaticAssetHref(href: string): boolean {
  try {
    const url = new URL(href, window.location.href)
    return (
      url.pathname.includes('/_next/static/') &&
      !url.pathname.includes('/_offline-navigation-')
    )
  } catch {
    return false
  }
}

function getCurrentNextStaticAssetHrefs(): string[] {
  const hrefs = new Set<string>()

  for (const element of document.querySelectorAll('script[src],link[href]')) {
    let href: string | null = null
    if (element instanceof HTMLScriptElement) {
      href = element.src
    } else if (element instanceof HTMLLinkElement) {
      href = element.href
    }

    if (href !== null && isNextStaticAssetHref(href)) {
      hrefs.add(href)
    }
  }

  for (const entry of performance.getEntriesByType('resource')) {
    if (isNextStaticAssetHref(entry.name)) {
      hrefs.add(entry.name)
    }
  }

  return Array.from(hrefs)
}

function postCurrentNextStaticAssetsToServiceWorker(): void {
  const controller = navigator.serviceWorker.controller
  if (controller === null) {
    return
  }

  const hrefs = getCurrentNextStaticAssetHrefs()
  if (hrefs.length === 0) {
    return
  }

  const message: OfflineNavigationCacheStaticAssetsMessage = {
    type: OFFLINE_NAVIGATION_CACHE_STATIC_ASSETS,
    hrefs,
  }
  controller.postMessage(message)
}

function syncCurrentNextStaticAssetsWithServiceWorker(): void {
  if (isSyncingCurrentStaticAssets) {
    return
  }
  isSyncingCurrentStaticAssets = true

  const post = () => postCurrentNextStaticAssetsToServiceWorker()

  // The first page load may fetch bootstrap scripts, CSS, and viewport
  // prefetch chunks before the generated worker controls the page. Once it is
  // controlling, hand those already-observed static resources to the worker so
  // offline replay does not depend on the browser HTTP cache.
  if (navigator.serviceWorker.controller !== null) {
    post()
  } else {
    navigator.serviceWorker.addEventListener('controllerchange', post, {
      once: true,
    })
  }

  if (document.readyState === 'complete') {
    post()
  } else {
    window.addEventListener('load', post, { once: true })
  }

  navigator.serviceWorker.ready.then(post).catch(() => {})
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

  syncCurrentNextStaticAssetsWithServiceWorker()

  // Registration is best-effort: a failed service worker install should not
  // affect the current online page load.
  navigator.serviceWorker
    .register(getServiceWorkerHref(), {
      scope: getServiceWorkerScope(),
      updateViaCache: 'none',
    })
    .catch(() => {})
}
