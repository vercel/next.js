/* global location */
import '../build/polyfills/polyfill-module'
// @ts-ignore react-dom/client exists when using React 18
import ReactDOMClient from 'react-dom/client'
// @ts-ignore startTransition exists when using React 18
import React, { useState, startTransition } from 'react'
import { RefreshContext } from './streaming/refresh'
import {
  createFromFetch,
  createFromReadableStream,
} from 'next/dist/compiled/react-server-dom-webpack'

/// <reference types="react-dom/experimental" />

export const version = process.env.__NEXT_VERSION

const appElement: HTMLElement | Document | null = document

let reactRoot: any = null

function renderReactElement(
  domEl: HTMLElement | Document,
  fn: () => JSX.Element
): void {
  const reactEl = fn()
  if (!reactRoot) {
    // Unlike with createRoot, you don't need a separate root.render() call here
    reactRoot = (ReactDOMClient as any).hydrateRoot(domEl, reactEl)
  } else {
    reactRoot.render(reactEl)
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

function nextServerDataCallback(seg: [number, string, string]) {
  if (seg[0] === 0) {
    initialServerDataBuffer = []
  } else {
    if (!initialServerDataBuffer)
      throw new Error('Unexpected server data: missing bootstrap script.')

    if (initialServerDataWriter) {
      initialServerDataWriter.enqueue(encoder.encode(seg[2]))
    } else {
      initialServerDataBuffer.push(seg[2])
    }
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

const nextServerDataLoadingGlobal = ((self as any).__next_s =
  (self as any).__next_s || [])
nextServerDataLoadingGlobal.forEach(nextServerDataCallback)
nextServerDataLoadingGlobal.push = nextServerDataCallback

function createResponseCache() {
  return new Map<string, any>()
}
const rscCache = createResponseCache()

function useInitialServerResponse(cacheKey: string) {
  const response = rscCache.get(cacheKey)
  if (response) return response

  const readable = new ReadableStream({
    start(controller) {
      nextServerDataRegisterWriter(controller)
    },
  })
  const newResponse = createFromReadableStream(readable)

  rscCache.set(cacheKey, newResponse)
  return newResponse
}

const ServerRoot = ({ cacheKey }: { cacheKey: string }) => {
  React.useEffect(() => {
    rscCache.delete(cacheKey)
  })
  const response = useInitialServerResponse(cacheKey)
  const root = response.readRoot()
  return root
}

function Root({ children }: React.PropsWithChildren<{}>): React.ReactElement {
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

const RSCComponent = () => {
  const cacheKey = getCacheKey()
  const [, dispatch] = useState({})
  const rerender = () => dispatch({})
  // If there is no cache, or there is serialized data already
  function refreshCache(nextProps: any) {
    startTransition(() => {
      const currentCacheKey = getCacheKey()
      const response = createFromFetch(fetchFlight(currentCacheKey, nextProps))

      rscCache.set(currentCacheKey, response)
      rerender()
    })
  }

  return (
    <RefreshContext.Provider value={refreshCache}>
      <ServerRoot cacheKey={cacheKey} />
    </RefreshContext.Provider>
  )
}

function fetchFlight(href: string, props?: any) {
  const url = new URL(href, location.origin)
  const searchParams = url.searchParams
  searchParams.append('__flight__', '1')
  if (props) {
    searchParams.append('__props__', JSON.stringify(props))
  }
  return fetch(url.toString())
}

function useServerResponse(cacheKey: string) {
  let response = rscCache.get(cacheKey)
  if (response) return response

  response = createFromFetch(fetchFlight(getCacheKey()))

  rscCache.set(cacheKey, response)
  return response
}

const AppRouterContext = React.createContext({})

// TODO: move to client component when handling is implemented
function AppRouter({ initialUrl, children }: any) {
  const initialState = {
    url: initialUrl,
  }
  const previousUrlRef = React.useRef(initialState)
  const [current, setCurrent] = React.useState(initialState)

  const appRouter = React.useMemo(() => {
    return {
      push: (url: string) => {
        previousUrlRef.current = current
        setCurrent({ ...current, url })
        // TODO: update url eagerly or not?
        window.history.pushState(current, '', url)
      },
      url: current.url,
    }
  }, [current])

  // @ts-ignore TODO: for testing
  window.appRouter = appRouter

  console.log({
    appRouter,
    previous: previousUrlRef.current,
    current,
  })

  let root
  if (current.url !== previousUrlRef.current?.url) {
    // eslint-disable-next-line
    const data = useServerResponse(current.url)
    root = data.readRoot()
  }

  return (
    <AppRouterContext.Provider value={appRouter}>
      {root ? root : children}
    </AppRouterContext.Provider>
  )
}

export function hydrate() {
  renderReactElement(appElement!, () => (
    <React.StrictMode>
      <Root>
        <AppRouter initialUrl={location.pathname}>
          <RSCComponent />
        </AppRouter>
      </Root>
    </React.StrictMode>
  ))
}
