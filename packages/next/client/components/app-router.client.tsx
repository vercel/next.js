import React from 'react'
import { createFromFetch } from 'next/dist/compiled/react-server-dom-webpack'
import {
  AppRouterContext,
  AppTreeContext,
  FullAppTreeContext,
} from '../../shared/lib/app-router-context'
import type { AppRouterInstance } from '../../shared/lib/app-router-context'
import type { FlightRouterState, FlightData } from '../../server/app-render'
import { reducer } from './reducer'

function fetchFlight(
  url: URL,
  flightRouterStateData: string
): Promise<Response> {
  const flightUrl = new URL(url)
  const searchParams = flightUrl.searchParams
  searchParams.append('__flight__', '1')
  searchParams.append('__flight_router_state_tree__', flightRouterStateData)

  return fetch(flightUrl.toString())
}

export function fetchServerResponse(
  url: URL,
  flightRouterState: FlightRouterState
): { readRoot: () => FlightData } {
  const flightRouterStateData = JSON.stringify(flightRouterState)
  return createFromFetch(fetchFlight(url, flightRouterStateData))
}

export default function AppRouter({
  initialTree,
  children,
}: {
  initialTree: FlightRouterState
  children: React.ReactNode
}) {
  const [{ tree, cache }, dispatch] = React.useReducer<typeof reducer>(
    reducer,
    {
      tree: initialTree,
      cache: {
        subTreeData: null,
        parallelRoutes: {},
      },
    }
  )

  // Server response only patches the tree
  const changeByServerResponse = React.useCallback(
    (previousTree: FlightRouterState, flightData: FlightData) => {
      dispatch({
        type: 'server-patch',
        payload: {
          flightData,
          previousTree,
        },
      })
    },
    []
  )

  const appRouter = React.useMemo<AppRouterInstance>(() => {
    const routerInstance: AppRouterInstance = {
      // TODO: implement prefetching of loading / flight
      prefetch: (_href) => Promise.resolve(),
      replace: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          dispatch({
            type: 'push',
            payload: {
              url: new URL(href, location.origin),
              method: 'replaceState',
            },
          })
        })
      },
      push: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          dispatch({
            type: 'push',
            payload: {
              url: new URL(href, location.origin),
              method: 'pushState',
            },
          })
        })
      },
    }

    return routerInstance
  }, [])

  if (typeof window !== 'undefined') {
    // @ts-ignore TODO: this is for debugging
    window.nd = { router: appRouter, cache, tree }
  }

  const onPopState = React.useCallback(({ state }: PopStateEvent) => {
    if (!state) {
      return
    }

    // @ts-ignore useTransition exists
    // TODO: Ideally the back button should not use startTransition as it should apply the updates synchronously
    React.startTransition(() => {
      dispatch({ type: 'restore', payload: { historyState: state } })
    })
  }, [])

  React.useEffect(() => {
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [onPopState])

  React.useEffect(() => {
    window.history.replaceState({ tree: initialTree }, '')
  }, [initialTree])

  return (
    <FullAppTreeContext.Provider
      value={{
        changeByServerResponse,
        tree,
      }}
    >
      <AppRouterContext.Provider value={appRouter}>
        <AppTreeContext.Provider
          value={{
            childNodes: cache.parallelRoutes,
            tree: tree,
            // Root node always has `url`
            url: tree[2] as string,
          }}
        >
          {children}
        </AppTreeContext.Provider>
      </AppRouterContext.Provider>
    </FullAppTreeContext.Provider>
  )
}
