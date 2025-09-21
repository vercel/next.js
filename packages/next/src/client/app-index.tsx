import './app-globals'
import ReactDOMClient from 'react-dom/client'
import React, { use } from 'react'
// TODO: Explicitly import from client.browser
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream as createFromReadableStreamBrowser } from 'react-server-dom-webpack/client'
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
import { setAppBuildId } from './app-build-id'
import type { StaticIndicatorState } from './dev/hot-reloader/app/hot-reloader-app'
import { ST } from '../shared/lib/utils'

/// <reference types="react-dom/experimental" />

const createFromReadableStream =
  createFromReadableStreamBrowser as (typeof import('react-server-dom-webpack/client.browser'))['createFromReadableStream']

const performanceMarks = {
  /** Browser's built-in navigation start timestamp */
  navigationStart: 'navigationStart',
  /** Set before createRoot call during client-side rendering only */
  beforeRender: 'beforeRender',
  /** Set before hydrateRoot call during server-side rendering only */
  beforeHydration: 'beforeHydration',
  /** Set after initial React commit when hydration or render starts */
  afterInitialCommit: 'afterInitialCommit',
  /** Set when rsc stream processing begins */
  rscStreamStart: 'rscStreamStart',
  /** Set when rsc stream processing finishes */
  rscStreamEnd: 'rscStreamEnd',
} as const

const performanceMeasures = {
  /**
   * Measures the time from navigation start to before client-side render begins.
   * Only applicable for client-side rendering scenarios (error pages).
   */
  beforeRender: 'Next.js-before-render',

  /**
   * Measures the time from navigation start to before hydration begins.
   * Tracks the initial loading phase before React takes over the SSRd HTML.
   */
  beforeHydration: 'Next.js-before-hydration',

  /**
   * Measures the time from hydration start to after the initial commit is complete.
   */
  initialCommit: 'Next.js-initial-commit',

  /**
   * Measures the complete duration of the rsc stream reader processing.
   * Tracks from when the client begins reading the rsc stream until it finishes.
   */
  rscStream: 'Next.js-rsc-stream-reader',
} as const

const appElement: HTMLElement | Document = document

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
      if (isStreamErrorOrUnfinished(ctr)) {
        ctr.error(
          new Error(
            'The connection to the page was unexpectedly closed, possibly due to the stop button being clicked, loss of Wi-Fi, or an unstable internet connection.'
          )
        )
      } else {
        ctr.close()
        markRscStreamEnd()
      }
      initialServerDataFlushed = true
      initialServerDataBuffer = undefined
    }
  }

  initialServerDataWriter = ctr
}

// When `DOMContentLoaded`, we can close all pending writers to finish hydration.
const DOMContentLoaded = function () {
  if (initialServerDataWriter && !initialServerDataFlushed) {
    initialServerDataWriter.close()
    markRscStreamEnd()
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
nextServerDataLoadingGlobal.forEach(nextServerDataCallback)
nextServerDataLoadingGlobal.push = nextServerDataCallback

const readable = new ReadableStream({
  start(controller) {
    nextServerDataRegisterWriter(controller)
  },
})

let debugChannel:
  | { readable?: ReadableStream; writable?: WritableStream }
  | undefined

if (
  process.env.NODE_ENV !== 'production' &&
  process.env.__NEXT_REACT_DEBUG_CHANNEL &&
  typeof window !== 'undefined'
) {
  const { createDebugChannel } =
    require('./dev/debug-channel') as typeof import('./dev/debug-channel')

  debugChannel = createDebugChannel(undefined)
}

if (ST) {
  performance.mark(performanceMarks.rscStreamStart)
}

const initialServerResponse = createFromReadableStream<InitialRSCPayload>(
  readable,
  { callServer, findSourceMapURL, debugChannel }
)

function ServerRoot({
  pendingActionQueue,
  webSocket,
  staticIndicatorState,
}: {
  pendingActionQueue: Promise<AppRouterActionQueue>
  webSocket: WebSocket | undefined
  staticIndicatorState: StaticIndicatorState | undefined
}): React.ReactNode {
  const initialRSCPayload = use(initialServerResponse)
  const actionQueue = use<AppRouterActionQueue>(pendingActionQueue)

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

function Root({
  children,
  callbacks,
}: React.PropsWithChildren<{
  callbacks?: Array<() => void>
}>) {
  const callbacksExecutedRef = React.useRef(false)

  React.useEffect(() => {
    if (callbacksExecutedRef.current || !callbacks) {
      return
    }

    callbacksExecutedRef.current = true

    for (const callback of callbacks) {
      callback()
    }
  }, [callbacks])

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

function markRootCommitComplete(): void {
  if (!ST) return

  performance.mark(performanceMarks.afterInitialCommit)

  const hasBeforeRenderMark = performance.getEntriesByName(
    performanceMarks.beforeRender,
    'mark'
  ).length

  const hasBeforeHydrationMark = performance.getEntriesByName(
    performanceMarks.beforeHydration,
    'mark'
  ).length

  if (hasBeforeRenderMark) {
    performance.measure(
      performanceMeasures.beforeRender,
      performanceMarks.navigationStart,
      performanceMarks.beforeRender
    )

    performance.measure(
      performanceMeasures.initialCommit,
      performanceMarks.beforeRender,
      performanceMarks.afterInitialCommit
    )
  }

  if (hasBeforeHydrationMark) {
    performance.measure(
      performanceMeasures.beforeHydration,
      performanceMarks.navigationStart,
      performanceMarks.beforeHydration
    )

    performance.measure(
      performanceMeasures.initialCommit,
      performanceMarks.beforeHydration,
      performanceMarks.afterInitialCommit
    )
  }
}

function markRscStreamEnd() {
  if (!ST) return

  performance.mark(performanceMarks.rscStreamEnd)

  const hasRSCStreamEndMark = performance.getEntriesByName(
    performanceMarks.rscStreamEnd,
    'mark'
  ).length

  if (
    hasRSCStreamEndMark &&
    performance.getEntriesByName(performanceMarks.rscStreamStart, 'mark').length
  ) {
    performance.measure(
      performanceMeasures.rscStream,
      performanceMarks.rscStreamStart,
      performanceMarks.rscStreamEnd
    )
  }
}

function onDefaultTransitionIndicator() {
  // TODO: Compose default with user-configureable (e.g. nprogress)
  // TODO: Use React's default once we figure out hanging indicators: https://codesandbox.io/p/sandbox/charming-moon-hktkp6?file=%2Fsrc%2Findex.js%3A106%2C30
  return () => {}
}

const reactRootOptions: ReactDOMClient.RootOptions = {
  onDefaultTransitionIndicator: onDefaultTransitionIndicator,
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

export function hydrate(
  instrumentationHooks: ClientInstrumentationHooks | null,
  assetPrefix: string
) {
  let staticIndicatorState: StaticIndicatorState | undefined
  let webSocket: WebSocket | undefined

  if (process.env.NODE_ENV !== 'production') {
    const { createWebSocket } =
      require('./dev/hot-reloader/app/web-socket') as typeof import('./dev/hot-reloader/app/web-socket')

    staticIndicatorState = { pathname: null, appIsrManifest: {} }
    webSocket = createWebSocket(assetPrefix, staticIndicatorState)
  }

  // React overrides `.then` and doesn't return a new promise chain,
  // so we wrap the action queue in a promise to ensure that its value
  // is defined when the promise resolves.
  // https://github.com/facebook/react/blob/163365a07872337e04826c4f501565d43dbd2fd4/packages/react-client/src/ReactFlightClient.js#L189-L190
  const pendingActionQueue: Promise<AppRouterActionQueue> = new Promise(
    (resolve, reject) => {
      initialServerResponse.then(
        (initialRSCPayload) => {
          // setAppBuildId should be called only once, during JS initialization
          // and before any components have hydrated.
          setAppBuildId(initialRSCPayload.b)

          const initialTimestamp = Date.now()

          resolve(
            createMutableActionQueue(
              createInitialRouterState({
                navigatedAt: initialTimestamp,
                initialFlightData: initialRSCPayload.f,
                initialCanonicalUrlParts: initialRSCPayload.c,
                initialParallelRoutes: new Map(),
                location: window.location,
                couldBeIntercepted: initialRSCPayload.i,
                postponed: initialRSCPayload.s,
                prerendered: initialRSCPayload.S,
              }),
              instrumentationHooks
            )
          )
        },
        (err: Error) => reject(err)
      )
    }
  )

  function createReactElement(callbacks?: Array<() => void>) {
    return (
      <StrictModeIfEnabled>
        <HeadManagerContext.Provider value={{ appDir: true }}>
          <Root callbacks={callbacks}>
            <ServerRoot
              pendingActionQueue={pendingActionQueue}
              webSocket={webSocket}
              staticIndicatorState={staticIndicatorState}
            />
          </Root>
        </HeadManagerContext.Provider>
      </StrictModeIfEnabled>
    )
  }

  if (document.documentElement.id === '__next_error__') {
    // Server rendering failed, fall back to client-side rendering
    if (ST) {
      performance.mark(performanceMarks.beforeRender)
    }

    const renderCallbacks = ST ? [markRootCommitComplete] : undefined
    const reactEl = createReactElement(renderCallbacks)

    let element = reactEl
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
    if (ST) {
      performance.mark(performanceMarks.beforeHydration)
    }

    const rootCommitCallbacks = ST ? [markRootCommitComplete] : undefined
    const reactEl = createReactElement(rootCommitCallbacks)

    React.startTransition(() => {
      ReactDOMClient.hydrateRoot(appElement, reactEl, {
        ...reactRootOptions,
        formState: initialFormStateData,
      })
    })
  }

  // TODO-APP: Remove this logic when Float has GC built-in in development.
  if (process.env.NODE_ENV !== 'production') {
    const { linkGc } =
      require('./app-link-gc') as typeof import('./app-link-gc')
    linkGc()
  }
}
