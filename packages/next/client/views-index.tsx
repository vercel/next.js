/* global location */
import '../build/polyfills/polyfill-module'
// @ts-ignore react-dom/client exists when using React 18
import ReactDOMClient from 'react-dom/client'
// @ts-ignore startTransition exists when using React 18
import React, { useState, startTransition } from 'react'
import { RefreshContext } from './streaming/refresh'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'

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
let initialServerDataWriter: WritableStreamDefaultWriter | undefined = undefined
let initialServerDataLoaded = false
let initialServerDataFlushed = false

function nextServerDataCallback(seg: [number, string, string]) {
  if (seg[0] === 0) {
    initialServerDataBuffer = []
  } else {
    if (!initialServerDataBuffer)
      throw new Error('Unexpected server data: missing bootstrap script.')

    if (initialServerDataWriter) {
      initialServerDataWriter.write(encoder.encode(seg[2]))
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
function nextServerDataRegisterWriter(writer: WritableStreamDefaultWriter) {
  if (initialServerDataBuffer) {
    initialServerDataBuffer.forEach((val) => {
      writer.write(encoder.encode(val))
    })
    if (initialServerDataLoaded && !initialServerDataFlushed) {
      writer.close()
      initialServerDataFlushed = true
      initialServerDataBuffer = undefined
    }
  }

  initialServerDataWriter = writer
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

function fetchFlight(href: string, props?: any) {
  const url = new URL(href, location.origin)
  const searchParams = url.searchParams
  searchParams.append('__flight__', '1')
  if (props) {
    searchParams.append('__props__', JSON.stringify(props))
  }
  return fetch(url.toString())
}

function useServerResponse(cacheKey: string, serialized?: string) {
  let response = rscCache.get(cacheKey)
  if (response) return response

  if (initialServerDataBuffer) {
    const t = new TransformStream()
    const writer = t.writable.getWriter()
    response = createFromFetch(Promise.resolve({ body: t.readable }))
    nextServerDataRegisterWriter(writer)
  } else {
    const fetchPromise = serialized
      ? (() => {
          const t = new TransformStream()
          const writer = t.writable.getWriter()
          writer.ready.then(() => {
            writer.write(new TextEncoder().encode(serialized))
          })
          return Promise.resolve({ body: t.readable })
        })()
      : fetchFlight(getCacheKey())
    response = createFromFetch(fetchPromise)
  }

  rscCache.set(cacheKey, response)
  return response
}

const ServerRoot = ({
  cacheKey,
  serialized,
}: {
  cacheKey: string
  serialized?: string
}) => {
  React.useEffect(() => {
    rscCache.delete(cacheKey)
  })
  const response = useServerResponse(cacheKey, serialized)
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

const RSCComponent = (props: any) => {
  const cacheKey = getCacheKey()
  const { __flight_serialized__ } = props
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
      <ServerRoot cacheKey={cacheKey} serialized={__flight_serialized__} />
    </RefreshContext.Provider>
  )
}

const ViewRouterContext = React.createContext({})

// TODO: move to client component when handling is implemented
function ViewRouter({ initialUrl, children }: any) {
  const initialState = {
    url: initialUrl,
  }
  const previousUrlRef = React.useRef(initialState)
  const [current, setCurrent] = React.useState(initialState)

  const viewRouter = React.useMemo(() => {
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
  window.viewRouter = viewRouter

  console.log({
    viewRouter,
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
    <ViewRouterContext.Provider value={viewRouter}>
      {root ? root : children}
    </ViewRouterContext.Provider>
  )
}

export function hydrate() {
  renderReactElement(appElement!, () => (
    <React.StrictMode>
      <Root>
        <ViewRouter initialUrl={location.pathname}>
          <RSCComponent />
        </ViewRouter>
      </Root>
    </React.StrictMode>
  ))
}
