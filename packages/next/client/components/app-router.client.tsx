import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import { AppRouterContext } from '../../shared/lib/app-router-context'

function createResponseCache() {
  return new Map<string, any>()
}
const rscCache = createResponseCache()

const getCacheKey = () => {
  const { pathname, search } = location
  return pathname + search
}

function fetchFlight(href: string) {
  const url = new URL(href, location.origin)
  const searchParams = url.searchParams
  searchParams.append('__flight__', '1')

  return fetch(url.toString())
}

function fetchServerResponse(cacheKey: string) {
  let response = rscCache.get(cacheKey)
  if (response) return response

  response = createFromFetch(fetchFlight(getCacheKey()))

  rscCache.set(cacheKey, response)
  return response
}

// TODO: move to client component when handling is implemented
export default function AppRouter({ initialUrl, children }: any) {
  const initialState = {
    url: initialUrl,
  }
  const previousUrlRef = React.useRef(initialState)
  const [current, setCurrent] = React.useState(initialState)
  const appRouter = React.useMemo(() => {
    return {
      prefetch: () => {},
      replace: () => {},
      push: (url: string) => {
        previousUrlRef.current = current
        setCurrent({ ...current, url })
        // TODO: update url eagerly or not?
        window.history.pushState(current, '', url)
      },
      url: current.url,
    }
  }, [current])
  if (typeof window !== 'undefined') {
    // @ts-ignore TODO: for testing
    window.appRouter = appRouter
    console.log({
      appRouter,
      previous: previousUrlRef.current,
      current,
    })
  }

  let root
  if (current.url !== previousUrlRef.current?.url) {
    // eslint-disable-next-line
    const data = fetchServerResponse(current.url)
    root = data.readRoot()
  }
  return (
    <AppRouterContext.Provider value={appRouter}>
      {root ? root : children}
    </AppRouterContext.Provider>
  )
}
