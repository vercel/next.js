import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import { AppRouterContext } from '../../shared/lib/app-router-context'

function createResponseCache() {
  return new Map<string, any>()
}
const rscCache = createResponseCache()

function fetchFlight(href: string, layoutPath?: string) {
  const flightUrl = new URL(href, location.origin.toString())
  const searchParams = flightUrl.searchParams
  searchParams.append('__flight__', '1')
  if (layoutPath) {
    searchParams.append('__flight_router_path__', layoutPath)
  }

  return fetch(flightUrl.toString())
}

export function fetchServerResponse(href: string, layoutPath?: string) {
  const cacheKey = href + layoutPath
  let response = rscCache.get(cacheKey)
  if (response) return response

  response = createFromFetch(fetchFlight(href, layoutPath))

  rscCache.set(cacheKey, response)
  return response
}

// TODO: move to client component when handling is implemented
export default function AppRouter({ initialUrl, layoutPath, children }: any) {
  const initialState = {
    url: initialUrl,
  }
  const previousUrlRef = React.useRef(initialState)
  const [current, setCurrent] = React.useState(initialState)
  // @ts-ignore useTransition exists
  const [, startBackTransition] = React.useTransition()
  const change = React.useCallback(
    (method: 'replaceState' | 'pushState', url: string) => {
      previousUrlRef.current = current
      const state = { ...current, url }
      setCurrent(state)
      // TODO: update url eagerly or not?
      window.history[method](state, '', url)
    },
    [current]
  )
  const appRouter = React.useMemo(() => {
    return {
      prefetch: () => Promise.resolve({}),
      replace: (url: string) => {
        return change('replaceState', url)
      },
      push: (url: string) => {
        return change('pushState', url)
      },
      url: current.url,
    }
  }, [current, change])

  const onPopState = React.useCallback(
    ({ state }: PopStateEvent) => {
      if (!state) {
        return
      }
      startBackTransition(() => change('replaceState', state.url))
    },
    [startBackTransition, change]
  )
  React.useEffect(() => {
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  })

  let root
  if (current.url !== previousUrlRef.current?.url) {
    // eslint-disable-next-line
    const data = fetchServerResponse(current.url, layoutPath)
    root = data.readRoot()
  }
  return (
    <AppRouterContext.Provider value={appRouter}>
      {root ? root : children}
    </AppRouterContext.Provider>
  )
}
