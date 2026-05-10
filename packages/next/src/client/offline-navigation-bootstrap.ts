import type { InitialRSCPayload } from '../shared/lib/app-router-types'
import { getDeploymentId } from '../shared/lib/deployment-id'
import {
  OFFLINE_NAVIGATION_CACHE_MISS_ELEMENT_ID,
  OFFLINE_NAVIGATION_CACHE_REASON_ATTRIBUTE,
  OFFLINE_NAVIGATION_CACHE_STATUS_ATTRIBUTE,
  OFFLINE_NAVIGATION_FALLBACK_DOCUMENT_ATTRIBUTE,
} from '../shared/lib/offline-navigation-constants'
import DefaultGlobalError from './components/builtin/global-error'

type OfflineNavigationCacheMissReason =
  | 'missing-route'
  | 'unsupported-route'
  | 'missing-segment'
  | 'missing-head'
  | 'read-error'

export type OfflineNavigationFallbackBootstrap =
  | {
      kind: 'segment-cache'
      initialRSCPayload: InitialRSCPayload
      buildId: string | undefined
    }
  | {
      kind: 'cache-miss'
      buildId: string | undefined
    }

export function isOfflineNavigationFallbackDocument(): boolean {
  return Boolean(
    !process.env.__NEXT_DEV_SERVER &&
      document.documentElement.hasAttribute(
        OFFLINE_NAVIGATION_FALLBACK_DOCUMENT_ATTRIBUTE
      )
  )
}

// Private test markers for the offline navigation e2e suite. These are only
// emitted when the production testing API is explicitly enabled.
function showOfflineNavigationCacheHit(): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    document.documentElement.setAttribute(
      OFFLINE_NAVIGATION_CACHE_STATUS_ATTRIBUTE,
      'hit'
    )
    document.documentElement.removeAttribute(
      OFFLINE_NAVIGATION_CACHE_REASON_ATTRIBUTE
    )
  }
}

function showOfflineNavigationCacheMiss(
  reason: OfflineNavigationCacheMissReason
): void {
  if (process.env.__NEXT_EXPOSE_TESTING_API) {
    document.documentElement.setAttribute(
      OFFLINE_NAVIGATION_CACHE_STATUS_ATTRIBUTE,
      'miss'
    )
    document.documentElement.setAttribute(
      OFFLINE_NAVIGATION_CACHE_REASON_ATTRIBUTE,
      reason
    )
  }
  const cacheMissElement = document.getElementById(
    OFFLINE_NAVIGATION_CACHE_MISS_ELEMENT_ID
  )
  if (cacheMissElement !== null) {
    cacheMissElement.hidden = false
    if (process.env.__NEXT_EXPOSE_TESTING_API) {
      cacheMissElement.setAttribute(
        OFFLINE_NAVIGATION_CACHE_REASON_ATTRIBUTE,
        reason
      )
    }
  }
}

function neverResolveInitialRSCPayload(): Promise<InitialRSCPayload> {
  return new Promise<InitialRSCPayload>(() => {})
}

// The generated fallback document has no inline Flight data for the current
// URL. Hydrate the persisted Segment Cache records, then reconstruct the
// initial payload from the in-memory Segment Cache.
export function createOfflineNavigationFallbackBootstrap():
  | Promise<OfflineNavigationFallbackBootstrap>
  | undefined {
  if (!isOfflineNavigationFallbackDocument()) {
    return undefined
  }

  return (async (): Promise<OfflineNavigationFallbackBootstrap> => {
    const {
      createOfflineNavigationInitialRSCPayloadFromSegmentCache,
      hydrateOfflineNavigationSegmentCache,
    } =
      require('./components/segment-cache/cache') as typeof import('./components/segment-cache/cache')

    const buildId =
      getDeploymentId() ??
      document.documentElement.getAttribute('data-build-id') ??
      undefined
    await hydrateOfflineNavigationSegmentCache({
      buildId,
    })

    const reconstruction =
      createOfflineNavigationInitialRSCPayloadFromSegmentCache({
        buildId,
        globalErrorState: [DefaultGlobalError, undefined],
        now: Date.now(),
        url: location.href,
      })
    if (reconstruction.status === 'fulfilled') {
      showOfflineNavigationCacheHit()
      return {
        kind: 'segment-cache',
        initialRSCPayload: reconstruction.initialRSCPayload,
        buildId,
      }
    }
    showOfflineNavigationCacheMiss(reconstruction.reason)
    return {
      kind: 'cache-miss',
      buildId,
    }
  })().catch((): OfflineNavigationFallbackBootstrap => {
    showOfflineNavigationCacheMiss('read-error')
    return {
      kind: 'cache-miss',
      buildId: undefined,
    }
  })
}

export function getOfflineNavigationInitialRSCPayload(
  bootstrap: Promise<OfflineNavigationFallbackBootstrap>
): Promise<InitialRSCPayload> {
  return bootstrap.then(async (result) => {
    if (result.kind === 'segment-cache') {
      return result.initialRSCPayload
    }

    return await neverResolveInitialRSCPayload()
  })
}

export function notifyOfflineNavigationFallback(
  bootstrap: Promise<OfflineNavigationFallbackBootstrap> | undefined
): void {
  if (bootstrap === undefined) {
    return
  }

  const { notifyOffline } =
    require('./components/offline') as typeof import('./components/offline')
  notifyOffline()
}

export function registerOfflineNavigationServiceWorker(): void {
  if (process.env.__NEXT_DEV_SERVER) {
    return
  } else {
    const { registerOfflineNavigationServiceWorker: registerServiceWorker } =
      require('./offline-navigation-service-worker') as typeof import('./offline-navigation-service-worker')
    registerServiceWorker()
  }
}
