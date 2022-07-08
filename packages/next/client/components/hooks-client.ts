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

export function useSearchParam(key: string) {
  const params = useContext(QueryContext)
  return params[key]
}

// TODO: Move the other router context over to this one
export function useRouter() {
  return useContext(AppRouterContext)
}

// TODO: getting all params when client-side navigating is non-trivial as it does not have route matchers so this might have to be a server context instead.
// export function useParams() {
//   return useContext(ParamsContext)
// }

export function usePathname() {
  return useContext(PathnameContext)
}

// TODO: define what should be provided through context.
// export function useLayoutSegments() {
//   return useContext(LayoutSegmentsContext)
// }

export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
) {
  const { tree } = useContext(AppTreeContext)

  return tree[1][parallelRouteKey][0]
}
