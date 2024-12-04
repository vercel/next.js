// imports polyfill from `@next/polyfill-module` after build.
import '../build/polyfills/polyfill-module'

import './components/globals/patch-console'
import './components/globals/handle-global-errors'

import ReactDOMClient from 'react-dom/client'
import React, { use } from 'react'
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'
import { HeadManagerContext } from '../shared/lib/head-manager-context.shared-runtime'
import { onRecoverableError } from './react-client-callbacks/shared'
import {
  onCaughtError,
  onUncaughtError,
} from './react-client-callbacks/app-router'
import { callServer } from './app-call-server'
import { findSourceMapURL } from './app-find-source-map-url'
import {
  type AppRouterActionQueue,
  createMutableActionQueue,
} from '../shared/lib/router/action-queue'
import AppRouter from './components/app-router'
import type { InitialRSCPayload } from '../server/app-render/types'
import { createInitialRouterState } from './components/router-reducer/create-initial-router-state'
import { MissingSlotContext } from '../shared/lib/app-router-context.shared-runtime'
import { setAppBuildId } from './app-build-id'

/// <reference types="react-dom/experimental" />

const appElement: HTMLElement | Document | null = document

const encoder = new TextEncoder()

let initialServerDataBuffer: (string | Uint8Array)[] | undefined = undefined
let initialServerDataWriter: ReadableStreamDefaultController | undefined =
  undefined
let initialServerDataLoaded = false
let initialServerDataFlushed = false

let initialFormStateData: null | any = null

function nextServerDataCallback(
  seg:
    | [isBootStrap: 0]
    | [isNotBootstrap: 1, responsePartial: string]
    | [isFormState: 2, formState: any]
    | [isBinary: 3, responseBase64Partial: string]
): void {
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

const nextServerDataLoadingGlobal = ((self as any).__next_f =
  (self as any).__next_f || [])
nextServerDataLoadingGlobal.forEach(nextServerDataCallback)
nextServerDataLoadingGlobal.push = nextServerDataCallback

const readable = new ReadableStream({
  start(controller) {
    nextServerDataRegisterWriter(controller)
  },
})

const initialServerResponse = createFromReadableStream<InitialRSCPayload>(
  readable,
  { callServer, findSourceMapURL }
)

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

        resolve(
          createMutableActionQueue(
            createInitialRouterState({
              initialFlightData: initialRSCPayload.f,
              initialCanonicalUrlParts: initialRSCPayload.c,
              initialParallelRoutes: new Map(),
              location: window.location,
              couldBeIntercepted: initialRSCPayload.i,
              postponed: initialRSCPayload.s,
              prerendered: initialRSCPayload.S,
            })
          )
        )
      },
      (err: Error) => reject(err)
    )
  }
)

function ServerRoot(): React.ReactNode {
  const initialRSCPayload = use(initialServerResponse)
  const actionQueue = use<AppRouterActionQueue>(pendingActionQueue)

  const router = (
    <AppRouter
      actionQueue={actionQueue}
      globalErrorComponentAndStyles={initialRSCPayload.G}
      assetPrefix={initialRSCPayload.p}
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
      window.__NEXT_HYDRATED_CB?.()
    }, [])
  }

  return children
}

const reactRootOptions = {
  onRecoverableError,
  onCaughtError,
  onUncaughtError,
} satisfies ReactDOMClient.RootOptions

export function hydrate() {
  const reactEl = (
    <StrictModeIfEnabled>
      <HeadManagerContext.Provider value={{ appDir: true }}>
        <Root>
          <ServerRoot />
        </Root>
      </HeadManagerContext.Provider>
    </StrictModeIfEnabled>
  )

  const rootLayoutMissingTags = window.__next_root_layout_missing_tags
  const hasMissingTags = !!rootLayoutMissingTags?.length

  const isError =
    document.documentElement.id === '__next_error__' || hasMissingTags

  if (isError) {
    if (process.env.NODE_ENV !== 'production') {
      const createDevOverlayElement =
        require('./components/react-dev-overlay/client-entry').createDevOverlayElement
      const errorTree = createDevOverlayElement(reactEl)
      ReactDOMClient.createRoot(appElement as any, reactRootOptions).render(
        errorTree
      )
    } else {
      ReactDOMClient.createRoot(appElement as any, reactRootOptions).render(
        reactEl
      )
    }
  } else {
    React.startTransition(() =>
      (ReactDOMClient as any).hydrateRoot(appElement, reactEl, {
        ...reactRootOptions,
        formState: initialFormStateData,
      })
    )
  }

  // TODO-APP: Remove this logic when Float has GC built-in in development.
  if (process.env.NODE_ENV !== 'production') {
    const { linkGc } =
      require('./app-link-gc') as typeof import('./app-link-gc')
    linkGc()
  }
}
