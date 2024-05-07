import '../build/polyfills/polyfill-module'
// @ts-ignore react-dom/client exists when using React 18
import ReactDOMClient from 'react-dom/client'
import React, { use } from 'react'
// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'

import { HeadManagerContext } from '../shared/lib/head-manager-context.shared-runtime'
import { onRecoverableError } from './on-recoverable-error'
import { callServer } from './app-call-server'
import { isNextRouterError } from './components/is-next-router-error'
import {
  ActionQueueContext,
  createMutableActionQueue,
} from '../shared/lib/router/action-queue'
import { HMR_ACTIONS_SENT_TO_BROWSER } from '../server/dev/hot-reloader-types'

// Since React doesn't call onerror for errors caught in error boundaries.
const origConsoleError = window.console.error
window.console.error = (...args) => {
  // See https://github.com/facebook/react/blob/d50323eb845c5fde0d720cae888bf35dedd05506/packages/react-reconciler/src/ReactFiberErrorLogger.js#L78
  if (
    process.env.NODE_ENV !== 'production'
      ? isNextRouterError(args[1])
      : isNextRouterError(args[0])
  ) {
    return
  }
  origConsoleError.apply(window.console, args)
}

window.addEventListener('error', (ev: WindowEventMap['error']): void => {
  if (isNextRouterError(ev.error)) {
    ev.preventDefault()
    return
  }
})

/// <reference types="react-dom/experimental" />

const appElement: HTMLElement | Document | null = document

const encoder = new TextEncoder()

let initialServerDataBuffer: string[] | undefined = undefined
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
  }
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
      ctr.enqueue(encoder.encode(val))
    })
    if (initialServerDataLoaded && !initialServerDataFlushed) {
      ctr.close()
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
  DOMContentLoaded()
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

const initialServerResponse = createFromReadableStream(readable, {
  callServer,
})

function ServerRoot(): React.ReactNode {
  return use(initialServerResponse)
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

export function hydrate() {
  const actionQueue = createMutableActionQueue()

  const reactEl = (
    <StrictModeIfEnabled>
      <HeadManagerContext.Provider value={{ appDir: true }}>
        <ActionQueueContext.Provider value={actionQueue}>
          <Root>
            <ServerRoot />
          </Root>
        </ActionQueueContext.Provider>
      </HeadManagerContext.Provider>
    </StrictModeIfEnabled>
  )

  const rootLayoutMissingTags = window.__next_root_layout_missing_tags
  const hasMissingTags = !!rootLayoutMissingTags?.length

  const options = {
    onRecoverableError,
  } satisfies ReactDOMClient.RootOptions
  const isError =
    document.documentElement.id === '__next_error__' || hasMissingTags

  if (process.env.NODE_ENV !== 'production') {
    // Patch console.error to collect information about hydration errors
    const patchConsoleError =
      require('./components/react-dev-overlay/internal/helpers/hydration-error-info')
        .patchConsoleError as typeof import('./components/react-dev-overlay/internal/helpers/hydration-error-info').patchConsoleError
    if (!isError) {
      patchConsoleError()
    }
  }

  if (isError) {
    if (process.env.NODE_ENV !== 'production') {
      // if an error is thrown while rendering an RSC stream, this will catch it in dev
      // and show the error overlay
      const ReactDevOverlay: typeof import('./components/react-dev-overlay/app/ReactDevOverlay').default =
        require('./components/react-dev-overlay/app/ReactDevOverlay')
          .default as typeof import('./components/react-dev-overlay/app/ReactDevOverlay').default

      const INITIAL_OVERLAY_STATE: typeof import('./components/react-dev-overlay/shared').INITIAL_OVERLAY_STATE =
        require('./components/react-dev-overlay/shared').INITIAL_OVERLAY_STATE

      const getSocketUrl: typeof import('./components/react-dev-overlay/internal/helpers/get-socket-url').getSocketUrl =
        require('./components/react-dev-overlay/internal/helpers/get-socket-url')
          .getSocketUrl as typeof import('./components/react-dev-overlay/internal/helpers/get-socket-url').getSocketUrl

      const FallbackLayout = hasMissingTags
        ? ({ children }: { children: React.ReactNode }) => (
            <html id="__next_error__">
              <body>{children}</body>
            </html>
          )
        : React.Fragment
      const errorTree = (
        <FallbackLayout>
          <ReactDevOverlay
            state={{ ...INITIAL_OVERLAY_STATE, rootLayoutMissingTags }}
            onReactError={() => {}}
          >
            {reactEl}
          </ReactDevOverlay>
        </FallbackLayout>
      )
      const socketUrl = getSocketUrl(process.env.__NEXT_ASSET_PREFIX || '')
      const socket = new window.WebSocket(`${socketUrl}/_next/webpack-hmr`)

      // add minimal "hot reload" support for RSC errors
      const handler = (event: MessageEvent) => {
        let obj
        try {
          obj = JSON.parse(event.data)
        } catch {}

        if (!obj || !('action' in obj)) {
          return
        }

        if (
          obj.action === HMR_ACTIONS_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES
        ) {
          window.location.reload()
        }
      }

      socket.addEventListener('message', handler)
      ReactDOMClient.createRoot(appElement as any, options).render(errorTree)
    } else {
      ReactDOMClient.createRoot(appElement as any, options).render(reactEl)
    }
  } else {
    React.startTransition(() =>
      (ReactDOMClient as any).hydrateRoot(appElement, reactEl, {
        ...options,
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
