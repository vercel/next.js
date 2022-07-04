import React, { useEffect } from 'react'
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
  initialCanonicalUrl,
  children,
}: {
  initialTree: FlightRouterState
  initialCanonicalUrl: string
  children: React.ReactNode
}) {
  const [{ tree, cache, pushRef, canonicalUrl }, dispatch] = React.useReducer<
    typeof reducer
  >(reducer, {
    tree: initialTree,
    cache: {
      data: null,
      subTreeData: null,
      parallelRoutes: new Map(),
    },
    pushRef: { pendingPush: false, mpaNavigation: false },
    canonicalUrl: initialCanonicalUrl,
  })

  // Server response only patches the tree
  const changeByServerResponse = React.useCallback(
    (previousTree: FlightRouterState, flightData: FlightData) => {
      dispatch({
        type: 'server-patch',
        payload: {
          flightData,
          previousTree,
          cache: {
            data: null,
            subTreeData: null,
            parallelRoutes: new Map(),
          },
        },
      })
    },
    []
  )

  const appRouter = React.useMemo<AppRouterInstance>(() => {
    const navigate = (
      href: string,
      cacheType: 'hard' | 'soft',
      navigateType: 'push' | 'replace'
    ) => {
      return dispatch({
        type: 'navigate',
        payload: {
          url: new URL(href, location.origin),
          cacheType,
          navigateType,
          cache: {
            data: null,
            subTreeData: null,
            parallelRoutes: new Map(),
          },
          mutable: {},
        },
      })
    }

    const routerInstance: AppRouterInstance = {
      // TODO: implement prefetching of loading / flight
      prefetch: (_href) => Promise.resolve(),
      replace: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'hard', 'replace')
        })
      },
      softReplace: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'soft', 'replace')
        })
      },
      softPush: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'soft', 'push')
        })
      },
      push: (href) => {
        // @ts-ignore startTransition exists
        React.startTransition(() => {
          navigate(href, 'hard', 'push')
        })
      },
    }

    return routerInstance
  }, [])

  useEffect(() => {
    console.log(
      'UPDATE URL',
      pushRef.pendingPush ? 'push' : 'replace',
      pushRef.mpaNavigation ? 'MPA' : '',
      tree
    )

    if (pushRef.mpaNavigation) {
      window.location.href = canonicalUrl
      return
    }

    if (pushRef.pendingPush) {
      pushRef.pendingPush = false
      window.history.pushState({ tree }, '', canonicalUrl)
    } else {
      window.history.replaceState({ tree }, '', canonicalUrl)
    }
  }, [tree, pushRef, canonicalUrl])

  if (typeof window !== 'undefined') {
    // @ts-ignore this is for debugging
    window.nd = { router: appRouter, cache, tree }
  }

  const onPopState = React.useCallback(({ state }: PopStateEvent) => {
    if (!state) {
      // TODO: this case only happens when pushState/replaceState was called outside of Next.js. It should probably reload the page in this case.
      return
    }

    // @ts-ignore useTransition exists
    // TODO: Ideally the back button should not use startTransition as it should apply the updates synchronously
    // Without startTransition works if the cache is there for this path
    React.startTransition(() => {
      dispatch({
        type: 'restore',
        payload: {
          url: new URL(window.location.href),
          historyState: state,
        },
      })
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
            url: canonicalUrl,
          }}
        >
          {children}
        </AppTreeContext.Provider>
      </AppRouterContext.Provider>
    </FullAppTreeContext.Provider>
  )
}
