// useLayoutSegments() // Only the segments for the current place. ['children', 'dashboard', 'children', 'integrations'] -> /dashboard/integrations (/dashboard/layout.js would get ['children', 'dashboard', 'children', 'integrations'])

import type { FlightRouterState } from '../../server/app-render'
import { useContext, useMemo } from 'react'
import {
  SearchParamsContext,
  // ParamsContext,
  PathnameContext,
  // LayoutSegmentsContext,
} from './hooks-client-context'
import {
  AppRouterContext,
  LayoutRouterContext,
} from '../../shared/lib/app-router-context'
import { RouterContext } from '../../shared/lib/router-context'
import type { ParsedUrlQuery } from 'querystring'
import { HybridRouter, HYBRID_ROUTER_TYPE } from './hybrid-router'

export {
  ServerInsertedHTMLContext,
  useServerInsertedHTML,
} from '../../shared/lib/server-inserted-html'

const INTERNAL_URLSEARCHPARAMS_INSTANCE = Symbol(
  'internal for urlsearchparams readonly'
)

function readonlyURLSearchParamsError() {
  return new Error('ReadonlyURLSearchParams cannot be modified')
}

class ReadonlyURLSearchParams {
  [INTERNAL_URLSEARCHPARAMS_INSTANCE]: URLSearchParams

  entries: URLSearchParams['entries']
  forEach: URLSearchParams['forEach']
  get: URLSearchParams['get']
  getAll: URLSearchParams['getAll']
  has: URLSearchParams['has']
  keys: URLSearchParams['keys']
  values: URLSearchParams['values']
  toString: URLSearchParams['toString']

  constructor(urlSearchParams: URLSearchParams) {
    // Since `new Headers` uses `this.append()` to fill the headers object ReadonlyHeaders can't extend from Headers directly as it would throw.
    this[INTERNAL_URLSEARCHPARAMS_INSTANCE] = urlSearchParams

    this.entries = urlSearchParams.entries.bind(urlSearchParams)
    this.forEach = urlSearchParams.forEach.bind(urlSearchParams)
    this.get = urlSearchParams.get.bind(urlSearchParams)
    this.getAll = urlSearchParams.getAll.bind(urlSearchParams)
    this.has = urlSearchParams.has.bind(urlSearchParams)
    this.keys = urlSearchParams.keys.bind(urlSearchParams)
    this.values = urlSearchParams.values.bind(urlSearchParams)
    this.toString = urlSearchParams.toString.bind(urlSearchParams)
  }
  [Symbol.iterator]() {
    return this[INTERNAL_URLSEARCHPARAMS_INSTANCE][Symbol.iterator]()
  }

  append() {
    throw readonlyURLSearchParamsError()
  }
  delete() {
    throw readonlyURLSearchParamsError()
  }
  set() {
    throw readonlyURLSearchParamsError()
  }
  sort() {
    throw readonlyURLSearchParamsError()
  }
}

/**
 * parsedURLQueryToURLSearchParams converts a parsed url query to a url search
 * params object.
 *
 * @param query parsed url query
 * @returns url search params object
 */
function parsedURLQueryToURLSearchParams(
  query: ParsedUrlQuery
): URLSearchParams {
  return new URLSearchParams(
    Object.keys(query).reduce<[string, string][]>((acc, name) => {
      const value = query[name]
      if (Array.isArray(value)) {
        acc.push(...value.map<[string, string]>((v) => [name, v]))
      } else {
        acc.push([name, value])
      }

      return acc
    }, [])
  )
}

/**
 * Get a read-only URLSearchParams object. For example searchParams.get('foo') would return 'bar' when ?foo=bar
 * Learn more about URLSearchParams here: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
 */
export function useSearchParams() {
  const router = useContext(RouterContext)
  const searchParams = useContext(SearchParamsContext)

  const readonlySearchParams = useMemo(() => {
    // To support migration from pages to app, this adds a workaround that'll
    // support the pages router here too.
    if (router) {
      return new ReadonlyURLSearchParams(
        parsedURLQueryToURLSearchParams(router.query)
      )
    }

    if (searchParams) {
      return new ReadonlyURLSearchParams(searchParams)
    }

    throw new Error('invariant at least one router was expected')
  }, [router, searchParams])

  return readonlySearchParams
}

// TODO-APP: Move the other router context over to this one
/**
 * Get the router methods. For example router.push('/dashboard')
 */
export function useRouter(): HybridRouter {
  const router = useContext(RouterContext)
  const appRouter = useContext(AppRouterContext)

  return useMemo(() => {
    if (router) {
      return { [HYBRID_ROUTER_TYPE]: 'pages', ...router }
    }

    if (appRouter) {
      return { [HYBRID_ROUTER_TYPE]: 'app', ...appRouter }
    }

    throw new Error('invariant at least one router was expected')
  }, [router, appRouter])
}

// TODO-APP: getting all params when client-side navigating is non-trivial as it does not have route matchers so this might have to be a server context instead.
// export function useParams() {
//   return useContext(ParamsContext)
// }

/**
 * Get the current pathname. For example usePathname() on /dashboard?foo=bar would return "/dashboard"
 */
export function usePathname(): string | null {
  const router = useContext(RouterContext)
  const pathname = useContext(PathnameContext)

  if (router) {
    if (router.isReady) {
      return router.asPath
    }

    return null
  }

  return pathname
}

// TODO-APP: define what should be provided through context.
// export function useLayoutSegments() {
//   return useContext(LayoutSegmentsContext)
// }

// TODO-APP: handle parallel routes
function getSelectedLayoutSegmentPath(
  tree: FlightRouterState,
  parallelRouteKey: string,
  first = true,
  segmentPath: string[] = []
): string[] {
  let node: FlightRouterState
  if (first) {
    // Use the provided parallel route key on the first parallel route
    node = tree[1][parallelRouteKey]
  } else {
    // After first parallel route prefer children, if there's no children pick the first parallel route.
    const parallelRoutes = tree[1]
    node = parallelRoutes.children ?? Object.values(parallelRoutes)[0]
  }

  if (!node) return segmentPath
  const segment = node[0]
  const segmentValue = Array.isArray(segment) ? segment[1] : segment
  if (!segmentValue) return segmentPath

  segmentPath.push(segmentValue)

  return getSelectedLayoutSegmentPath(
    node,
    parallelRouteKey,
    false,
    segmentPath
  )
}

// TODO-APP: Expand description when the docs are written for it.
/**
 * Get the canonical segment path from this level to the leaf node.
 */
export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
): string[] {
  const { tree } = useContext(LayoutRouterContext)
  return getSelectedLayoutSegmentPath(tree, parallelRouteKey)
}
