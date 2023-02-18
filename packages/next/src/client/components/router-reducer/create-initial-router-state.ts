import type { ReactNode } from 'react'
import type { CacheNode } from '../../../shared/lib/app-router-context'
import type { FlightRouterState } from '../../../server/app-render'

import { CacheStates } from '../../../shared/lib/app-router-context'
import { createHrefFromUrl } from './create-href-from-url'
import { fillLazyItemsTillLeafWithHead } from './fill-lazy-items-till-leaf-with-head'

export interface InitialRouterStateParameters {
  initialTree: FlightRouterState
  initialCanonicalUrl: string
  children: ReactNode
  initialParallelRoutes: CacheNode['parallelRoutes']
  isServer: boolean
  location: Location | null
  initialHead: ReactNode
}

export function createInitialRouterState({
  initialTree,
  children,
  initialCanonicalUrl,
  initialParallelRoutes,
  isServer,
  location,
  initialHead,
}: InitialRouterStateParameters) {
  const cache: CacheNode = {
    status: CacheStates.READY,
    data: null,
    subTreeData: children,
    // The cache gets seeded during the first render. `initialParallelRoutes` ensures the cache from the first render is there during the second render.
    parallelRoutes: isServer ? new Map() : initialParallelRoutes,
  }

  // When the cache hasn't been seeded yet we fill the cache with the head.
  if (initialParallelRoutes === null || initialParallelRoutes.size === 0) {
    fillLazyItemsTillLeafWithHead(cache, undefined, initialTree, initialHead)
  }

  return {
    tree: initialTree,
    cache,
    prefetchCache: new Map(),
    pushRef: { pendingPush: false, mpaNavigation: false },
    focusAndScrollRef: { apply: false },
    canonicalUrl:
      // location.href is read as the initial value for canonicalUrl in the browser
      // This is safe to do as canonicalUrl can't be rendered, it's only used to control the history updates in the useEffect further down in this file.
      location
        ? // window.location does not have the same type as URL but has all the fields createHrefFromUrl needs.
          createHrefFromUrl(location)
        : initialCanonicalUrl,
  }
}
