import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import { AppRouterContext } from '../../shared/lib/app-router-context'
import useRouter from './userouter.js'

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

export default function AppRouter({ initialUrl, layoutPath, children }: any) {
  const [appRouter, previousUrlRef, current] = useRouter(initialUrl)

  const onPopState = React.useCallback(
    ({ state }: PopStateEvent) => {
      if (!state) {
        return
      }
      // @ts-ignore useTransition exists
      // TODO: Ideally the back button should not use startTransition as it should apply the updates synchronously
      React.startTransition(() => appRouter.replace(state.url))
    },
    [appRouter]
  )
  React.useEffect(() => {
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  })

  let root
  // TODO: Check the RSC cache first for the page you want to navigate to
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
