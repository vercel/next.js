import './app-globals'
import ReactDOMClient from 'react-dom/client'
import React from 'react'
// TODO: Explicitly import from client.browser
// eslint-disable-next-line import/no-extraneous-dependencies
import {
  createFromReadableStream as createFromReadableStreamBrowser,
  createFromFetch as createFromFetchBrowser,
} from 'react-server-dom-webpack/client'
import { HeadManagerContext } from '../shared/lib/head-manager-context.shared-runtime'
import { onRecoverableError } from './react-client-callbacks/on-recoverable-error'
import {
  onCaughtError,
  onUncaughtError,
} from './react-client-callbacks/error-boundary-callbacks'
import { callServer } from './app-call-server'
import { findSourceMapURL } from './app-find-source-map-url'
import {
  type AppRouterActionQueue,
  createMutableActionQueue,
} from './components/app-router-instance'
import AppRouter from './components/app-router'
import type { InitialRSCPayload } from '../shared/lib/app-router-types'
import { createInitialRouterState } from './components/router-reducer/create-initial-router-state'
import { MissingSlotContext } from '../shared/lib/app-router-context.shared-runtime'
import type { StaticIndicatorState } from './dev/hot-reloader/app/hot-reloader-app'
import { createInitialRSCPayloadFromFallbackPrerender } from './flight-data-helpers'
import { getDeploymentId } from '../shared/lib/deployment-id'
import { setNavigationBuildId } from './navigation-build-id'

/// <reference types="react-dom/experimental" />

const createFromReadableStream =
  createFromReadableStreamBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromReadableStream']
const createFromFetch =
  createFromFetchBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromFetch']

const appElement: HTMLElement | Document = document

// Instant Navigation Testing API: captured once at module init. When truthy,
// this is the fetch promise for the static RSC payload (set by an injected
// <script> tag in the static shell HTML).
const instantTestStaticFetch: Promise<Response> | undefined =
  self.__next_instant_test
    ? (self.__next_instant_test as unknown as Promise<Response>)
    : undefined

function isOfflineNavigationFallbackDocument(): boolean {
  return Boolean(
    process.env.__NEXT_OFFLINE_NAVIGATIONS &&
      !process.env.__NEXT_DEV_SERVER &&
      document.documentElement.hasAttribute(
        'data-next-offline-navigation-fallback'
      )
  )
}

const OFFLINE_NAVIGATION_DIAGNOSTIC_LIMIT = 32

type OfflineNavigationCacheMissReason =
  | 'missing-entry'
  | 'invalid-payload'
  | 'unsupported-request-kind'
  | 'read-error'

type OfflineNavigationFallbackDiagnostic =
  | {
      type: 'cache-hit'
      url: string
      buildId: string | undefined
      requestKind: OfflineNavigationFallbackResponse['requestKind']
    }
  | {
      type: 'cache-miss'
      url: string
      buildId: string | undefined
      reason: OfflineNavigationCacheMissReason
    }

declare global {
  interface Window {
    __NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__?:
      | OfflineNavigationFallbackDiagnostic[]
      | undefined
  }
}

function reportOfflineNavigationFallbackDiagnostic(
  diagnostic: OfflineNavigationFallbackDiagnostic
): void {
  const diagnostics = (window.__NEXT_OFFLINE_NAVIGATION_DIAGNOSTICS__ ??= [])
  if (diagnostics.length >= OFFLINE_NAVIGATION_DIAGNOSTIC_LIMIT) {
    diagnostics.shift()
  }
  diagnostics.push(diagnostic)
}

function showOfflineNavigationCacheHit(
  requestKind: OfflineNavigationFallbackResponse['requestKind'],
  buildId: string | undefined
): void {
  document.documentElement.setAttribute(
    'data-next-offline-navigation-cache',
    'hit'
  )
  document.documentElement.removeAttribute(
    'data-next-offline-navigation-cache-reason'
  )
  reportOfflineNavigationFallbackDiagnostic({
    type: 'cache-hit',
    url: location.href,
    buildId,
    requestKind,
  })
}

function showOfflineNavigationCacheMiss(
  reason: OfflineNavigationCacheMissReason,
  buildId: string | undefined
): void {
  document.documentElement.setAttribute(
    'data-next-offline-navigation-cache',
    'miss'
  )
  document.documentElement.setAttribute(
    'data-next-offline-navigation-cache-reason',
    reason
  )
  const cacheMissElement = document.getElementById(
    '__NEXT_OFFLINE_NAVIGATION_CACHE_MISS'
  )
  if (cacheMissElement !== null) {
    cacheMissElement.hidden = false
    cacheMissElement.setAttribute(
      'data-next-offline-navigation-cache-reason',
      reason
    )
  }
  reportOfflineNavigationFallbackDiagnostic({
    type: 'cache-miss',
    url: location.href,
    buildId,
    reason,
  })
}

function neverResolveOfflineNavigationResponse(): Promise<Response> {
  return new Promise<Response>(() => {})
}

type OfflineNavigationFallbackResponse = {
  requestKind: 'client-resume' | 'initial-load'
  response: Response
}

function createOfflineNavigationFallbackResponse():
  | Promise<OfflineNavigationFallbackResponse>
  | undefined {
  if (!isOfflineNavigationFallbackDocument()) {
    return undefined
  }

  return (async (): Promise<OfflineNavigationFallbackResponse> => {
    const {
      createOfflineNavigationRSCResponse,
      isOfflineNavigationRSCResponsePayload,
      readOfflineNavigationCacheEntry,
    } =
      require('./components/router-reducer/offline-navigation-cache') as typeof import('./components/router-reducer/offline-navigation-cache')

    const buildId =
      getDeploymentId() ??
      document.documentElement.getAttribute('data-build-id') ??
      undefined
    const entry = await readOfflineNavigationCacheEntry(location.href, {
      buildId,
    })
    const payload = entry?.payload

    if (!isOfflineNavigationRSCResponsePayload(payload)) {
      showOfflineNavigationCacheMiss(
        payload === undefined ? 'missing-entry' : 'invalid-payload',
        buildId
      )
      return {
        requestKind: 'client-resume',
        response: await neverResolveOfflineNavigationResponse(),
      }
    }

    if (
      payload.requestKind !== 'client-resume' &&
      payload.requestKind !== 'initial-load'
    ) {
      showOfflineNavigationCacheMiss('unsupported-request-kind', buildId)
      return {
        requestKind: 'client-resume',
        response: await neverResolveOfflineNavigationResponse(),
      }
    }

    const requestKind: OfflineNavigationFallbackResponse['requestKind'] =
      payload.requestKind === 'initial-load' ? 'initial-load' : 'client-resume'

    showOfflineNavigationCacheHit(requestKind, buildId)
    return {
      requestKind,
      response: createOfflineNavigationRSCResponse(payload),
    }
  })().catch(async (): Promise<OfflineNavigationFallbackResponse> => {
    showOfflineNavigationCacheMiss('read-error', undefined)
    return {
      requestKind: 'client-resume',
      response: await neverResolveOfflineNavigationResponse(),
    }
  })
}

const offlineNavigationFallbackResponse =
  createOfflineNavigationFallbackResponse()
const offlineNavigationClientResumeFetch =
  offlineNavigationFallbackResponse?.then(({ response }) => response)

const hasClientResumeShell =
  // @ts-expect-error
  Boolean(window.__NEXT_CLIENT_RESUME)
const hasLockedStaticShell =
  Boolean(instantTestStaticFetch) ||
  Boolean(offlineNavigationClientResumeFetch) ||
  hasClientResumeShell

const encoder = new TextEncoder()

let initialServerDataBuffer: (string | Uint8Array)[] | undefined = undefined
let initialServerDataWriter: ReadableStreamDefaultController | undefined =
  undefined
let initialServerDataLoaded = false
let initialServerDataFlushed = false

let initialFormStateData: null | any = null

type FlightSegment =
  | [isBootStrap: 0]
  | [isNotBootstrap: 1, responsePartial: string]
  | [isFormState: 2, formState: any]
  | [isBinary: 3, responseBase64Partial: string]

type NextFlight = Omit<Array<FlightSegment>, 'push'> & {
  push: (seg: FlightSegment) => void
}

declare global {
  // If you're working in a browser environment
  interface Window {
    /**
     * request ID, dev-only
     */
    __next_r?: string
    __next_f: NextFlight
  }
}

function nextServerDataCallback(seg: FlightSegment): void {
  if (seg[0] === 0) {
    initialServerDataBuffer = []
  } else if (seg[0] === 1) {
    if (!initialServerDataBuffer)
      throw new Error('Unexpected server data: missing bootstrap script.')

    if (initialServerDataWriter) {
      initialServerDataWriter.enqueue(encoder.encode(seg[1]))
    } else {
      initialServerDataBuffer.push(seg[1])
    }
  } else if (seg[0] === 2) {
    initialFormStateData = seg[1]
  } else if (seg[0] === 3) {
    if (!initialServerDataBuffer)
      throw new Error('Unexpected server data: missing bootstrap script.')

    // Decode the base64 string back to binary data.
    const binaryString = atob(seg[1])
    const decodedChunk = new Uint8Array(binaryString.length)
    for (var i = 0; i < binaryString.length; i++) {
      decodedChunk[i] = binaryString.charCodeAt(i)
    }

    if (initialServerDataWriter) {
      initialServerDataWriter.enqueue(decodedChunk)
    } else {
      initialServerDataBuffer.push(decodedChunk)
    }
  }
}

function isStreamErrorOrUnfinished(ctr: ReadableStreamDefaultController) {
  // If `desiredSize` is null, it means the stream is closed or errored. If it is lower than 0, the stream is still unfinished.
  return ctr.desiredSize === null || ctr.desiredSize < 0
}

// There might be race conditions between `nextServerDataRegisterWriter` and
// `DOMContentLoaded`. The former will be called when React starts to hydrate
// the root, the latter will be called when the DOM is fully loaded.
// For streaming, the former is called first due to partial hydration.
// For non-streaming, the latter can be called first.
// Hence, we use two variables `initialServerDataLoaded` and
// `initialServerDataFlushed` to make sure the writer will be closed and
// `initialServerDataBuffer` will be cleared in the right time.
function nextServerDataRegisterWriter(ctr: ReadableStreamDefaultController) {
  if (initialServerDataBuffer) {
    initialServerDataBuffer.forEach((val) => {
      ctr.enqueue(typeof val === 'string' ? encoder.encode(val) : val)
    })
    if (initialServerDataLoaded && !initialServerDataFlushed) {
      // Locked static shells do not have a real inline Flight stream. Closing
      // or erroring this stream causes React to report a missing-data failure,
      // but the actual hydration data arrives through a separate response.
      if (isStreamErrorOrUnfinished(ctr)) {
        if (!hasLockedStaticShell) {
          ctr.error(
            new Error(
              'The connection to the page was unexpectedly closed, possibly due to the stop button being clicked, loss of Wi-Fi, or an unstable internet connection.'
            )
          )
        }
      } else {
        ctr.close()
      }
      initialServerDataFlushed = true
      initialServerDataBuffer = undefined
    }
  }

  initialServerDataWriter = ctr
}

// When `DOMContentLoaded`, we can close all pending writers to finish hydration.
const DOMContentLoaded = function () {
  if (
    initialServerDataWriter &&
    !initialServerDataFlushed &&
    !hasLockedStaticShell
  ) {
    initialServerDataWriter.close()
    initialServerDataFlushed = true
    initialServerDataBuffer = undefined
  }
  initialServerDataLoaded = true
}

// It's possible that the DOM is already loaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', DOMContentLoaded, false)
} else {
  // Delayed in marco task to ensure it's executed later than hydration
  setTimeout(DOMContentLoaded)
}

const nextServerDataLoadingGlobal = (self.__next_f = self.__next_f || [])

// Consume all buffered chunks and clear the global data array right after to release memory.
// Otherwise it will be retained indefinitely.
nextServerDataLoadingGlobal.forEach(nextServerDataCallback)
nextServerDataLoadingGlobal.length = 0

// Patch its push method so subsequent chunks are handled (but not actually pushed to the array).
nextServerDataLoadingGlobal.push = nextServerDataCallback

let readable: ReadableStream<Uint8Array> = new ReadableStream({
  start(controller) {
    nextServerDataRegisterWriter(controller)
  },
})
if (process.env.NODE_ENV !== 'production') {
  // @ts-expect-error
  readable.name = 'hydration'
}

// When Cache Components is enabled, tee the inlined Flight stream so we can
// truncate a clone at the static stage byte boundary and cache it. We don't
// know if `l` is present until React decodes the payload, so always tee and
// cancel the clone if not needed.
let initialFlightStreamForCache: ReadableStream<Uint8Array> | null = null
let initialFlightStreamForOfflineNavigationCache: ReadableStream<Uint8Array> | null =
  null
if (
  process.env.__NEXT_OFFLINE_NAVIGATIONS &&
  process.env.NODE_ENV === 'production' &&
  process.env.__NEXT_CONFIG_OUTPUT !== 'export' &&
  !process.env.__NEXT_DEV_SERVER &&
  !hasLockedStaticShell
) {
  const [forApp, forOfflineNavigationCache] = readable.tee()
  readable = forApp
  initialFlightStreamForOfflineNavigationCache = forOfflineNavigationCache
}
if (
  process.env.__NEXT_CACHE_COMPONENTS &&
  process.env.__NEXT_EXPERIMENTAL_CACHED_NAVIGATIONS &&
  !offlineNavigationClientResumeFetch
) {
  const [forReact, forCache] = readable.tee()
  readable = forReact
  initialFlightStreamForCache = forCache
}

let debugChannel:
  | { readable?: ReadableStream; writable?: WritableStream }
  | undefined

if (
  process.env.__NEXT_DEV_SERVER &&
  process.env.__NEXT_REACT_DEBUG_CHANNEL &&
  typeof window !== 'undefined'
) {
  const { createDebugChannel } =
    require('./dev/debug-channel') as typeof import('./dev/debug-channel')

  debugChannel = createDebugChannel(undefined)
}

let initialServerResponse: Promise<InitialRSCPayload>
if (instantTestStaticFetch) {
  // Instant Navigation Testing API: hydrate from the static RSC payload
  // fetch kicked off by an injected <script> tag, instead of the inline
  // Flight data (which is not present in the static shell).
  initialServerResponse = Promise.resolve(
    createFromFetch<InitialRSCPayload>(instantTestStaticFetch, {
      callServer,
      findSourceMapURL,
      debugChannel,
      // The static fetch response is a partial stream (static-only Flight
      // data with no dynamic content). Allow it to close without error so
      // React treats dynamic holes as still-suspended rather than
      // triggering error recovery.
      unstable_allowPartialStream: true,
    })
  ).then(async (initialRSCPayload) => {
    return createInitialRSCPayloadFromFallbackPrerender(
      await instantTestStaticFetch,
      initialRSCPayload
    )
  })
} else if (offlineNavigationClientResumeFetch) {
  initialServerResponse = Promise.resolve(
    createFromFetch<InitialRSCPayload>(offlineNavigationClientResumeFetch, {
      callServer,
      findSourceMapURL,
      debugChannel,
      unstable_allowPartialStream: true,
    })
  ).then(async (fallbackInitialRSCPayload) => {
    const fallbackResponse = await offlineNavigationFallbackResponse!
    if (fallbackResponse.requestKind === 'initial-load') {
      return fallbackInitialRSCPayload
    }

    return createInitialRSCPayloadFromFallbackPrerender(
      fallbackResponse.response,
      fallbackInitialRSCPayload
    )
  })
} else if (
  // @ts-expect-error
  window.__NEXT_CLIENT_RESUME
) {
  const clientResumeFetch: Promise<Response> =
    // @ts-expect-error
    window.__NEXT_CLIENT_RESUME
  initialServerResponse = Promise.resolve(
    createFromFetch<InitialRSCPayload>(clientResumeFetch, {
      callServer,
      findSourceMapURL,
      debugChannel,
    })
  ).then(async (fallbackInitialRSCPayload) =>
    createInitialRSCPayloadFromFallbackPrerender(
      await clientResumeFetch,
      fallbackInitialRSCPayload
    )
  )
} else {
  initialServerResponse = createFromReadableStream<InitialRSCPayload>(
    readable,
    {
      callServer,
      findSourceMapURL,
      debugChannel,
      startTime: 0,
    }
  )
}

function ServerRoot({
  initialRSCPayload,
  actionQueue,
  webSocket,
  staticIndicatorState,
}: {
  initialRSCPayload: InitialRSCPayload
  actionQueue: AppRouterActionQueue
  webSocket: WebSocket | undefined
  staticIndicatorState: StaticIndicatorState | undefined
}): React.ReactNode {
  const router = (
    <AppRouter
      actionQueue={actionQueue}
      globalErrorState={initialRSCPayload.G}
      webSocket={webSocket}
      staticIndicatorState={staticIndicatorState}
    />
  )

  if (process.env.NODE_ENV === 'development' && initialRSCPayload.m) {
    // We provide missing slot information in a context provider only during development
    // as we log some additional information about the missing slots in the console.
    return (
      <MissingSlotContext value={initialRSCPayload.m}>
        {router}
      </MissingSlotContext>
    )
  }

  return router
}

const StrictModeIfEnabled = process.env.__NEXT_STRICT_MODE_APP
  ? React.StrictMode
  : React.Fragment

function Root({ children }: React.PropsWithChildren<{}>) {
  if (process.env.__NEXT_TEST_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      window.__NEXT_HYDRATED = true
      window.__NEXT_HYDRATED_AT = performance.now()
      window.__NEXT_HYDRATED_CB?.()
    }, [])
  }

  return children
}

const enableTransitionIndicator = process.env.__NEXT_TRANSITION_INDICATOR

function noDefaultTransitionIndicator() {
  return () => {}
}

const reactRootOptions: ReactDOMClient.RootOptions = {
  onDefaultTransitionIndicator: enableTransitionIndicator
    ? // TODO: Compose default with user-configureable (e.g. nprogress)
      undefined
    : noDefaultTransitionIndicator,
  onRecoverableError,
  onCaughtError,
  onUncaughtError,
}

export type ClientInstrumentationHooks = {
  onRouterTransitionStart?: (
    url: string,
    navigationType: 'push' | 'replace' | 'traverse'
  ) => void
}

export async function hydrate(
  instrumentationHooks: ClientInstrumentationHooks | null,
  assetPrefix: string
) {
  let staticIndicatorState: StaticIndicatorState | undefined
  let webSocket: WebSocket | undefined

  if (process.env.__NEXT_DEV_SERVER) {
    const { createWebSocket } =
      require('./dev/hot-reloader/app/web-socket') as typeof import('./dev/hot-reloader/app/web-socket')

    staticIndicatorState = { pathname: null, appIsrManifest: null }
    webSocket = createWebSocket(assetPrefix, staticIndicatorState)
  }
  const initialRSCPayload = await initialServerResponse

  // Initialize the offline module to register browser event listeners
  // (offline/online) before any components hydrate.
  if (process.env.__NEXT_USE_OFFLINE) {
    const { notifyOffline } =
      require('./components/offline') as typeof import('./components/offline')
    if (offlineNavigationClientResumeFetch) {
      notifyOffline()
    }
  }

  // setNavigationBuildId should be called only once, during JS initialization
  // and before any components have hydrated.
  if (initialRSCPayload.b) {
    setNavigationBuildId(initialRSCPayload.b!)
  } else {
    setNavigationBuildId(getDeploymentId()!)
  }

  if (
    process.env.__NEXT_OFFLINE_NAVIGATIONS &&
    !process.env.__NEXT_DEV_SERVER
  ) {
    const { registerOfflineNavigationServiceWorker } =
      require('./offline-navigation-service-worker') as typeof import('./offline-navigation-service-worker')
    registerOfflineNavigationServiceWorker()
  }

  const initialTimestamp = Date.now()
  const actionQueue: AppRouterActionQueue = createMutableActionQueue(
    createInitialRouterState({
      navigatedAt: initialTimestamp,
      initialRSCPayload,
      initialFlightStreamForCache,
      initialFlightStreamForOfflineNavigationCache,
      location: window.location,
    }),
    instrumentationHooks
  )

  const reactEl = (
    <StrictModeIfEnabled>
      <HeadManagerContext.Provider value={{ appDir: true }}>
        <Root>
          <ServerRoot
            initialRSCPayload={initialRSCPayload}
            actionQueue={actionQueue}
            webSocket={webSocket}
            staticIndicatorState={staticIndicatorState}
          />
        </Root>
      </HeadManagerContext.Provider>
    </StrictModeIfEnabled>
  )

  if (
    document.documentElement.id === '__next_error__' ||
    isOfflineNavigationFallbackDocument()
  ) {
    let element = reactEl
    // Error documents and generated offline navigation fallback documents do
    // not contain route HTML that can be hydrated.
    if (process.env.NODE_ENV !== 'production') {
      const { RootLevelDevOverlayElement } =
        require('../next-devtools/userspace/app/client-entry') as typeof import('../next-devtools/userspace/app/client-entry')

      // Note this won't cause hydration mismatch because we are doing CSR w/o hydration
      element = (
        <RootLevelDevOverlayElement>{element}</RootLevelDevOverlayElement>
      )
    }

    ReactDOMClient.createRoot(appElement, reactRootOptions).render(element)
  } else {
    React.startTransition(() => {
      ReactDOMClient.hydrateRoot(appElement, reactEl, {
        ...reactRootOptions,
        formState: initialFormStateData,
      })
    })
  }

  // TODO-APP: Remove this logic when Float has GC built-in in development.
  if (process.env.__NEXT_DEV_SERVER) {
    const { linkGc } =
      require('./app-link-gc') as typeof import('./app-link-gc')
    linkGc()
  }
}
