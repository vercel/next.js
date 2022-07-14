// useLayoutSegments() // Only the segments for the current place. ['children', 'dashboard', 'children', 'integrations'] -> /dashboard/integrations (/dashboard/layout.js would get ['children', 'dashboard', 'children', 'integrations'])

import { useContext } from 'react'
import {
  QueryContext,
  // ParamsContext,
  PathnameContext,
  // LayoutSegmentsContext,
} from './hooks-client-context'
import {
  AppRouterContext,
  AppTreeContext,
} from '../../shared/lib/app-router-context'

export function useSearchParams() {
  return useContext(QueryContext)
}

export function useSearchParam(key: string): string | string[] {
  const params = useContext(QueryContext)
  return params[key]
}

// TODO-APP: Move the other router context over to this one
export function useRouter(): import('../../shared/lib/app-router-context').AppRouterInstance {
  return useContext(AppRouterContext)
}

// TODO-APP: getting all params when client-side navigating is non-trivial as it does not have route matchers so this might have to be a server context instead.
// export function useParams() {
//   return useContext(ParamsContext)
// }

export function usePathname(): string {
  return useContext(PathnameContext)
}

// TODO-APP: define what should be provided through context.
// export function useLayoutSegments() {
//   return useContext(LayoutSegmentsContext)
// }

export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
): string {
  const { tree } = useContext(AppTreeContext)

  const segment = tree[1][parallelRouteKey][0]

  return Array.isArray(segment) ? segment[1] : segment
}
