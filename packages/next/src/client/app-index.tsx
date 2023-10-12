/* global location */
import '../build/polyfills/polyfill-module'
// @ts-ignore react-dom/client exists when using React 18
import ReactDOMClient from 'react-dom/client'
import React, { use, startTransition } from 'react'
// @ts-ignore
// eslint-disable-next-line import/no-extraneous-dependencies
import { createFromReadableStream } from 'react-server-dom-webpack/client'

import { HeadManagerContext } from '../shared/lib/head-manager-context.shared-runtime'
import {
  ActionQueueContext,
  GlobalLayoutRouterContext,
  type AppRouterActionQueue,
  type DispatchStatePromise,
  type ActionQueueNode,
} from '../shared/lib/app-router-context.shared-runtime'
import onRecoverableError from './on-recoverable-error'
import { callServer } from './app-call-server'
import { isNextRouterError } from './components/is-next-router-error'
import type {
  AppRouterState,
  ReducerActions,
} from './components/router-reducer/router-reducer-types'
import { reducer } from './components/router-reducer/router-reducer'

// Since React doesn't call onerror for errors caught in error boundaries.
const origConsoleError = window.console.error
window.console.error = (...args) => {
  if (isNextRouterError(args[0])) {
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

function finishRunningAction(
  actionQueue: AppRouterActionQueue,
  setState: DispatchStatePromise
) {
  if (actionQueue.pending !== null) {
    actionQueue.pending = actionQueue.pending.next
    if (actionQueue.pending !== null) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      runAction(actionQueue, actionQueue.pending.payload, setState)
    }
  }
}
async function runAction(
  actionQueue: AppRouterActionQueue,
  payload: ReducerActions,
  setState: DispatchStatePromise
) {
  const prevState = actionQueue.state
  const promise = actionQueue.action(prevState, payload)

  promise.then(
    (nextState: AppRouterState | null) => {
      actionQueue.state = nextState

      if (actionQueue.devToolsInstance) {
        actionQueue.devToolsInstance.send(payload, nextState)
      }

      finishRunningAction(actionQueue, setState)
    },
    () => {
      finishRunningAction(actionQueue, setState)
    }
  )

  startTransition(() => {
    setState(promise)
  })
}

function dispatchAction(
  actionQueue: AppRouterActionQueue,
  payload: ReducerActions,
  setState: DispatchStatePromise
) {
  const newAction: ActionQueueNode = {
    payload,
    next: null,
  }
  // Check if the queue is empty or if the action is a navigation action
  if (actionQueue.pending === null || payload.type === 'navigate') {
    // The queue is empty, so add the action and start it immediately
    // We also immediately start navigations as those shouldn't be blocked
    actionQueue.pending = newAction
    actionQueue.last = newAction
    runAction(actionQueue, newAction.payload, setState)
  } else {
    // The queue is not empty, so add the action to the end of the queue
    // It will be started by finishRunningAction after the previous action finishes
    if (actionQueue.last !== null) {
      actionQueue.last.next = newAction
    }
    actionQueue.last = newAction
  }
}

const getCacheKey = () => {
  const { pathname, search } = location
  return pathname + search
}

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

function createResponseCache() {
  return new Map<string, any>()
}
const rscCache = createResponseCache()

function useInitialServerResponse(cacheKey: string): Promise<JSX.Element> {
  const response = rscCache.get(cacheKey)
  if (response) return response

  const readable = new ReadableStream({
    start(controller) {
      nextServerDataRegisterWriter(controller)
    },
  })

  const newResponse = createFromReadableStream(readable, {
    callServer,
  })

  rscCache.set(cacheKey, newResponse)
  return newResponse
}

function ServerRoot({ cacheKey }: { cacheKey: string }): JSX.Element {
  React.useEffect(() => {
    rscCache.delete(cacheKey)
  })
  const response = useInitialServerResponse(cacheKey)
  const root = use(response)
  return root
}

const StrictModeIfEnabled = process.env.__NEXT_STRICT_MODE_APP
  ? React.StrictMode
  : React.Fragment

function Root({ children }: React.PropsWithChildren<{}>): React.ReactElement {
  if (process.env.__NEXT_ANALYTICS_ID) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      require('./performance-relayer-app')()
    }, [])
  }

  if (process.env.__NEXT_TEST_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      window.__NEXT_HYDRATED = true

      if (window.__NEXT_HYDRATED_CB) {
        window.__NEXT_HYDRATED_CB()
      }
    }, [])
  }

  return children as React.ReactElement
}

function RSCComponent(props: any): JSX.Element {
  return <ServerRoot {...props} cacheKey={getCacheKey()} />
}

export function hydrate() {
  if (process.env.NODE_ENV !== 'production') {
    const rootLayoutMissingTagsError = (self as any)
      .__next_root_layout_missing_tags_error
    const HotReload: typeof import('./components/react-dev-overlay/hot-reloader-client').default =
      require('./components/react-dev-overlay/hot-reloader-client')
        .default as typeof import('./components/react-dev-overlay/hot-reloader-client').default

    // Don't try to hydrate if root layout is missing required tags, render error instead
    if (rootLayoutMissingTagsError) {
      const reactRootElement = document.createElement('div')
      document.body.appendChild(reactRootElement)
      const reactRoot = (ReactDOMClient as any).createRoot(reactRootElement, {
        onRecoverableError,
      })

      reactRoot.render(
        <GlobalLayoutRouterContext.Provider
          value={{
            buildId: 'development',
            tree: rootLayoutMissingTagsError.tree,
            changeByServerResponse: () => {},
            focusAndScrollRef: {
              apply: false,
              onlyHashChange: false,
              hashFragment: null,
              segmentPaths: [],
            },
            nextUrl: null,
          }}
        >
          <HotReload
            assetPrefix={rootLayoutMissingTagsError.assetPrefix}
            // initialState={{
            //   rootLayoutMissingTagsError: {
            //     missingTags: rootLayoutMissingTagsError.missingTags,
            //   },
            // }}
          />
        </GlobalLayoutRouterContext.Provider>
      )

      return
    }
  }

  const actionQueue: AppRouterActionQueue = {
    state: null,
    dispatch: (payload: ReducerActions, setState: DispatchStatePromise) =>
      dispatchAction(actionQueue, payload, setState),
    action: async (state: AppRouterState | null, action: ReducerActions) => {
      if (state === null) throw new Error('Missing state')
      const result = reducer(state, action)
      return result
    },
    pending: null,
    last: null,
  }

  const reactEl = (
    <StrictModeIfEnabled>
      <HeadManagerContext.Provider
        value={{
          appDir: true,
        }}
      >
        <ActionQueueContext.Provider value={actionQueue}>
          <Root>
            <RSCComponent />
          </Root>
        </ActionQueueContext.Provider>
      </HeadManagerContext.Provider>
    </StrictModeIfEnabled>
  )

  const options = {
    onRecoverableError,
  }
  const isError = document.documentElement.id === '__next_error__'

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
      const ReactDevOverlay: typeof import('./components/react-dev-overlay/internal/ReactDevOverlay').default =
        require('./components/react-dev-overlay/internal/ReactDevOverlay')
          .default as typeof import('./components/react-dev-overlay/internal/ReactDevOverlay').default

      const INITIAL_OVERLAY_STATE: typeof import('./components/react-dev-overlay/internal/error-overlay-reducer').INITIAL_OVERLAY_STATE =
        require('./components/react-dev-overlay/internal/error-overlay-reducer').INITIAL_OVERLAY_STATE

      const getSocketUrl: typeof import('./components/react-dev-overlay/internal/helpers/get-socket-url').getSocketUrl =
        require('./components/react-dev-overlay/internal/helpers/get-socket-url')
          .getSocketUrl as typeof import('./components/react-dev-overlay/internal/helpers/get-socket-url').getSocketUrl

      let errorTree = (
        <ReactDevOverlay state={INITIAL_OVERLAY_STATE} onReactError={() => {}}>
          {reactEl}
        </ReactDevOverlay>
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

        if (obj.action === 'serverComponentChanges') {
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
        experimental_formState: initialFormStateData,
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
