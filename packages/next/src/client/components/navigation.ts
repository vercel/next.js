// useLayoutSegments() // Only the segments for the current place. ['children', 'dashboard', 'children', 'integrations'] -> /dashboard/integrations (/dashboard/layout.js would get ['children', 'dashboard', 'children', 'integrations'])

import { useContext, useMemo } from 'react'
import type { FlightRouterState } from '../../server/app-render/types'
import {
  AppRouterContext,
  GlobalLayoutRouterContext,
  LayoutRouterContext,
} from '../../shared/lib/app-router-context'
import {
  SearchParamsContext,
  PathnameContext,
} from '../../shared/lib/hooks-client-context'
import { clientHookInServerComponentError } from './client-hook-in-server-component-error'
import { getSegmentValue } from './router-reducer/reducers/get-segment-value'

const INTERNAL_URLSEARCHPARAMS_INSTANCE = Symbol(
  'internal for urlsearchparams readonly'
)

function readonlyURLSearchParamsError() {
  return new Error('ReadonlyURLSearchParams cannot be modified')
}

export class ReadonlyURLSearchParams {
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
export function useSearchParams(): ReadonlyURLSearchParams {
  clientHookInServerComponentError('useSearchParams')
  const searchParams = useContext(SearchParamsContext)

  // In the case where this is `null`, the compat types added in
  // `next-env.d.ts` will add a new overload that changes the return type to
  // include `null`.
  const readonlySearchParams = useMemo(() => {
    if (!searchParams) {
      // When the router is not ready in pages, we won't have the search params
      // available.
      return null
    }

    return new ReadonlyURLSearchParams(searchParams)
  }, [searchParams]) as ReadonlyURLSearchParams

  if (typeof window === 'undefined') {
    // AsyncLocalStorage should not be included in the client bundle.
    const { bailoutToClientRendering } =
      require('./bailout-to-client-rendering') as typeof import('./bailout-to-client-rendering')
    if (bailoutToClientRendering()) {
      // TODO-APP: handle dynamic = 'force-static' here and on the client
      return readonlySearchParams
    }
  }

  return readonlySearchParams
}

/**
 * Get the current pathname. For example usePathname() on /dashboard?foo=bar would return "/dashboard"
 */
export function usePathname(): string {
  clientHookInServerComponentError('usePathname')
  // In the case where this is `null`, the compat types added in `next-env.d.ts`
  // will add a new overload that changes the return type to include `null`.
  return useContext(PathnameContext) as string
}

export {
  ServerInsertedHTMLContext,
  useServerInsertedHTML,
} from '../../shared/lib/server-inserted-html'

/**
 * Get the router methods. For example router.push('/dashboard')
 */
export function useRouter(): import('../../shared/lib/app-router-context').AppRouterInstance {
  clientHookInServerComponentError('useRouter')
  const router = useContext(AppRouterContext)
  if (router === null) {
    throw new Error('invariant expected app router to be mounted')
  }

  return router
}

interface Params {
  [key: string]: string
}

// this function performs a depth-first search of the tree to find the selected
// params
function getSelectedParams(
  tree: FlightRouterState,
  params: Params = {}
): Params {
  const parallelRoutes = tree[1]

  for (const parallelRoute of Object.values(parallelRoutes)) {
    const segment = parallelRoute[0]
    const isDynamicParameter = Array.isArray(segment)
    const segmentValue = isDynamicParameter ? segment[1] : segment
    if (!segmentValue || segmentValue.startsWith('__PAGE__')) continue

    if (isDynamicParameter) {
      params[segment[0]] = segment[1]
    }

    params = getSelectedParams(parallelRoute, params)
  }

  return params
}

/**
 * Get the current parameters. For example useParams() on /dashboard/[team]
 * where pathname is /dashboard/nextjs would return { team: 'nextjs' }
 */
export function useParams(): Params {
  clientHookInServerComponentError('useParams')
  const globalLayoutRouterContext = useContext(GlobalLayoutRouterContext)
  if (!globalLayoutRouterContext) {
    // This only happens in `pages`. Type is overwritten in navigation.d.ts
    return null!
  }
  return getSelectedParams(globalLayoutRouterContext.tree)
}

// TODO-APP: handle parallel routes
/**
 * Get the canonical parameters from the current level to the leaf node.
 */
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

  const segmentValue = getSegmentValue(segment)
  if (!segmentValue || segmentValue.startsWith('__PAGE__')) return segmentPath

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
  clientHookInServerComponentError('useSelectedLayoutSegments')
  const { tree } = useContext(LayoutRouterContext)
  return getSelectedLayoutSegmentPath(tree, parallelRouteKey)
}

// TODO-APP: Expand description when the docs are written for it.
/**
 * Get the segment below the current level
 */
export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
): string | null {
  clientHookInServerComponentError('useSelectedLayoutSegment')
  const selectedLayoutSegments = useSelectedLayoutSegments(parallelRouteKey)
  if (selectedLayoutSegments.length === 0) {
    return null
  }

  return selectedLayoutSegments[0]
}

export { redirect } from './redirect'
export { notFound } from './not-found'
