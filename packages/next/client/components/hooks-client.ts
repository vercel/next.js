// useLayoutSegments() // Only the segments for the current place. ['children', 'dashboard', 'children', 'integrations'] -> /dashboard/integrations (/dashboard/layout.js would get ['children', 'dashboard', 'children', 'integrations'])

import { useContext } from 'react'
import {
  SearchParamsContext,
  // ParamsContext,
  PathnameContext,
  // LayoutSegmentsContext,
} from './hooks-client-context'
import {
  AppRouterContext,
  AppTreeContext,
} from '../../shared/lib/app-router-context'

/**
 * Get the current search params. For example useSearchParams() would return {"foo": "bar"} when ?foo=bar
 */
export function useSearchParams() {
  return useContext(SearchParamsContext)
}

/**
 * Get an individual search param. For example useSearchParam("foo") would return "bar" when ?foo=bar
 */
export function useSearchParam(key: string): string | string[] {
  const params = useContext(SearchParamsContext)
  return params[key]
}

// TODO-APP: Move the other router context over to this one
/**
 * Get the router methods. For example router.push('/dashboard')
 */
export function useRouter(): import('../../shared/lib/app-router-context').AppRouterInstance {
  return useContext(AppRouterContext)
}

// TODO-APP: getting all params when client-side navigating is non-trivial as it does not have route matchers so this might have to be a server context instead.
// export function useParams() {
//   return useContext(ParamsContext)
// }

/**
 * Get the current pathname. For example usePathname() on /dashboard?foo=bar would return "/dashboard"
 */
export function usePathname(): string {
  return useContext(PathnameContext)
}

// TODO-APP: define what should be provided through context.
// export function useLayoutSegments() {
//   return useContext(LayoutSegmentsContext)
// }

// TODO-APP: Expand description when the docs are written for it.
/**
 * Get the current segment one level down from the layout.
 */
export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
): string {
  const { tree } = useContext(AppTreeContext)

  const segment = tree[1][parallelRouteKey][0]

  return Array.isArray(segment) ? segment[1] : segment
}
