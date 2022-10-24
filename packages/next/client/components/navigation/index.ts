// useLayoutSegments() // Only the segments for the current place. ['children', 'dashboard', 'children', 'integrations'] -> /dashboard/integrations (/dashboard/layout.js would get ['children', 'dashboard', 'children', 'integrations'])

import type { FlightRouterState } from '../../../server/app-render'
import { useContext } from 'react'

import {
  AppRouterContext,
  LayoutRouterContext,
} from '../../../shared/lib/app-router-context'

// TODO-APP: Move the other router context over to this one
/**
 * Get the router methods. For example router.push('/dashboard')
 */
export function useRouter(): import('../../../shared/lib/app-router-context').AppRouterInstance {
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

export { redirect } from '../redirect'
export { notFound } from '../not-found'

export {
  useSearchParams,
  usePathname,
  ServerInsertedHTMLContext,
  useServerInsertedHTML,
} from './client'
