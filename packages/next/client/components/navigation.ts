// useLayoutSegments() // Only the segments for the current place. ['children', 'dashboard', 'children', 'integrations'] -> /dashboard/integrations (/dashboard/layout.js would get ['children', 'dashboard', 'children', 'integrations'])

import { useContext, useMemo } from 'react'
import type { FlightRouterState } from '../../server/app-render'
import {
  AppRouterContext,
  LayoutRouterContext,
} from '../../shared/lib/app-router-context'
import {
  SearchParamsContext,
  // ParamsContext,
  PathnameContext,
  // LayoutSegmentsContext,
} from './hooks-client-context'
import { staticGenerationBailout } from './static-generation-bailout'

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
 * Get a read-only URLSearchParams object. For example searchParams.get('foo') would return 'bar' when ?foo=bar
 * Learn more about URLSearchParams here: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
 */
export function useSearchParams() {
  staticGenerationBailout('useSearchParams')
  const searchParams = useContext(SearchParamsContext)
  const readonlySearchParams = useMemo(() => {
    return new ReadonlyURLSearchParams(searchParams)
  }, [searchParams])
  return readonlySearchParams
}

/**
 * Get the current pathname. For example usePathname() on /dashboard?foo=bar would return "/dashboard"
 */
export function usePathname(): string {
  staticGenerationBailout('usePathname')
  return useContext(PathnameContext)
}

// TODO-APP: getting all params when client-side navigating is non-trivial as it does not have route matchers so this might have to be a server context instead.
// export function useParams() {
//   return useContext(ParamsContext)
// }

// TODO-APP: define what should be provided through context.
// export function useLayoutSegments() {
//   return useContext(LayoutSegmentsContext)
// }

export {
  ServerInsertedHTMLContext,
  useServerInsertedHTML,
} from '../../shared/lib/server-inserted-html'

// TODO-APP: Move the other router context over to this one
/**
 * Get the router methods. For example router.push('/dashboard')
 */
export function useRouter(): import('../../shared/lib/app-router-context').AppRouterInstance {
  return useContext(AppRouterContext)
}

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
 * Get the canonical segment path from the current level to the leaf node.
 */
export function useSelectedLayoutSegments(
  parallelRouteKey: string = 'children'
): string[] {
  const { tree } = useContext(LayoutRouterContext)
  return getSelectedLayoutSegmentPath(tree, parallelRouteKey)
}

// TODO-APP: Expand description when the docs are written for it.
/**
 * Get the segment below the current level
 */
export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
): string {
  const selectedLayoutSegments = useSelectedLayoutSegments(parallelRouteKey)
  if (selectedLayoutSegments.length === 0) {
    throw new Error('No selected layout segment below the current level')
  }

  return selectedLayoutSegments[0]
}

export { redirect } from './redirect'
export { notFound } from './not-found'
