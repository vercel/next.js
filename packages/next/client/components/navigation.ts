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
} from '../../shared/lib/hooks-client-context'
import { bailoutToClientRendering } from './bailout-to-client-rendering'
import { ReadonlyURLSearchParams } from './readonly-url-search-params'

/**
 * Get a read-only URLSearchParams object. For example searchParams.get('foo') would return 'bar' when ?foo=bar
 * Learn more about URLSearchParams here: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
 */
export function useSearchParams() {
  const searchParams = useContext(SearchParamsContext)

  const readonlySearchParams = useMemo(() => {
    return new ReadonlyURLSearchParams(searchParams || new URLSearchParams())
  }, [searchParams])

  if (bailoutToClientRendering()) {
    // TODO-APP: handle dynamic = 'force-static' here and on the client
    return readonlySearchParams
  }

  if (!searchParams) {
    throw new Error(
      'Search Parameters Context was not mounted. See more info here https://nextjs.org/docs/messages/navigation-context-missing'
    )
  }

  return readonlySearchParams
}

/**
 * Get the current pathname. For example usePathname() on /dashboard?foo=bar would return "/dashboard"
 */
export function usePathname(): string {
  const pathname = useContext(PathnameContext)
  if (pathname === null) {
    throw new Error(
      'Pathname Context was not mounted. See more info here https://nextjs.org/docs/messages/navigation-context-missing'
    )
  }

  return pathname
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

/**
 * Get the router methods. For example router.push('/dashboard')
 */
export function useRouter(): import('../../shared/lib/app-router-context').AppRouterInstance {
  const router = useContext(AppRouterContext)
  if (router === null) {
    throw new Error(
      'App Router Context was not mounted. See more info here https://nextjs.org/docs/messages/navigation-context-missing'
    )
  }

  return router
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
): string | null {
  const selectedLayoutSegments = useSelectedLayoutSegments(parallelRouteKey)
  if (selectedLayoutSegments.length === 0) {
    return null
  }

  return selectedLayoutSegments[0]
}

export { redirect } from './redirect'
export { notFound } from './not-found'
