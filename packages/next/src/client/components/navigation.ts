import { useContext, useMemo } from 'react'
import type { FlightRouterState } from '../../server/app-render/types'
import {
  AppRouterContext,
  GlobalLayoutRouterContext,
  LayoutRouterContext,
  type AppRouterInstance,
} from '../../shared/lib/app-router-context.shared-runtime'
import {
  SearchParamsContext,
  PathnameContext,
  PathParamsContext,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import { clientHookInServerComponentError } from './client-hook-in-server-component-error'
import { getSegmentValue } from './router-reducer/reducers/get-segment-value'
import { PAGE_SEGMENT_KEY, DEFAULT_SEGMENT_KEY } from '../../shared/lib/segment'

/** @internal */
class ReadonlyURLSearchParamsError extends Error {
  constructor() {
    super(
      'Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams'
    )
  }
}

export class ReadonlyURLSearchParams extends URLSearchParams {
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  append() {
    throw new ReadonlyURLSearchParamsError()
  }
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  delete() {
    throw new ReadonlyURLSearchParamsError()
  }
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  set() {
    throw new ReadonlyURLSearchParamsError()
  }
  /** @deprecated Method unavailable on `ReadonlyURLSearchParams`. Read more: https://nextjs.org/docs/app/api-reference/functions/use-search-params#updating-searchparams */
  sort() {
    throw new ReadonlyURLSearchParamsError()
  }
}

/**
 * A [Client Component](https://nextjs.org/docs/app/building-your-application/rendering/client-components) hook
 * that lets you *read* the current URL's search parameters.
 *
 * Learn more about [`URLSearchParams` on MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams)
 *
 * @example
 * ```ts
 * "use client"
 * import { useSearchParams } from 'next/navigation'
 *
 * export default function Page() {
 *   const searchParams = useSearchParams()
 *   searchParams.get('foo') // returns 'bar' when ?foo=bar
 *   // ...
 * }
 * ```
 *
 * Read more: [Next.js Docs: `useSearchParams`](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
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
    // TODO-APP: handle dynamic = 'force-static' here and on the client
    bailoutToClientRendering('useSearchParams()')
  }

  return readonlySearchParams
}

/**
 * A [Client Component](https://nextjs.org/docs/app/building-your-application/rendering/client-components) hook
 * that lets you read the current URL's pathname.
 *
 * @example
 * ```ts
 * "use client"
 * import { usePathname } from 'next/navigation'
 *
 * export default function Page() {
 *  const pathname = usePathname() // returns "/dashboard" on /dashboard?foo=bar
 *  // ...
 * }
 * ```
 *
 * Read more: [Next.js Docs: `usePathname`](https://nextjs.org/docs/app/api-reference/functions/use-pathname)
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
} from '../../shared/lib/server-inserted-html.shared-runtime'

/**
 *
 * This hook allows you to programmatically change routes inside [Client Component](https://nextjs.org/docs/app/building-your-application/rendering/client-components).
 *
 * @example
 * ```ts
 * "use client"
 * import { useRouter } from 'next/navigation'
 *
 * export default function Page() {
 *  const router = useRouter()
 *  // ...
 *  router.push('/dashboard') // Navigate to /dashboard
 * }
 * ```
 *
 * Read more: [Next.js Docs: `useRouter`](https://nextjs.org/docs/app/api-reference/functions/use-router)
 */
export function useRouter(): AppRouterInstance {
  clientHookInServerComponentError('useRouter')
  const router = useContext(AppRouterContext)
  if (router === null) {
    throw new Error('invariant expected app router to be mounted')
  }

  return router
}

interface Params {
  [key: string]: string | string[]
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
    if (!segmentValue || segmentValue.startsWith(PAGE_SEGMENT_KEY)) continue

    // Ensure catchAll and optional catchall are turned into an array
    const isCatchAll =
      isDynamicParameter && (segment[2] === 'c' || segment[2] === 'oc')

    if (isCatchAll) {
      params[segment[0]] = segment[1].split('/')
    } else if (isDynamicParameter) {
      params[segment[0]] = segment[1]
    }

    params = getSelectedParams(parallelRoute, params)
  }

  return params
}

/**
 * A [Client Component](https://nextjs.org/docs/app/building-your-application/rendering/client-components) hook
 * that lets you read a route's dynamic params filled in by the current URL.
 *
 * @example
 * ```ts
 * "use client"
 * import { useParams } from 'next/navigation'
 *
 * export default function Page() {
 *   // on /dashboard/[team] where pathname is /dashboard/nextjs
 *   const { team } = useParams() // team === "nextjs"
 * }
 * ```
 *
 * Read more: [Next.js Docs: `useParams`](https://nextjs.org/docs/app/api-reference/functions/use-params)
 */
export function useParams<T extends Params = Params>(): T {
  clientHookInServerComponentError('useParams')
  const globalLayoutRouter = useContext(GlobalLayoutRouterContext)
  const pathParams = useContext(PathParamsContext)

  return useMemo(() => {
    // When it's under app router
    if (globalLayoutRouter?.tree) {
      return getSelectedParams(globalLayoutRouter.tree) as T
    }

    // When it's under client side pages router
    return pathParams as T
  }, [globalLayoutRouter?.tree, pathParams])
}

/** Get the canonical parameters from the current level to the leaf node. */
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
  if (!segmentValue || segmentValue.startsWith(PAGE_SEGMENT_KEY)) {
    return segmentPath
  }

  segmentPath.push(segmentValue)

  return getSelectedLayoutSegmentPath(
    node,
    parallelRouteKey,
    false,
    segmentPath
  )
}

/**
 * A [Client Component](https://nextjs.org/docs/app/building-your-application/rendering/client-components) hook
 * that lets you read the active route segments **below** the Layout it is called from.
 *
 * @example
 * ```ts
 * 'use client'
 *
 * import { useSelectedLayoutSegments } from 'next/navigation'
 *
 * export default function ExampleClientComponent() {
 *   const segments = useSelectedLayoutSegments()
 *
 *   return (
 *     <ul>
 *       {segments.map((segment, index) => (
 *         <li key={index}>{segment}</li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 *
 * Read more: [Next.js Docs: `useSelectedLayoutSegments`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segments)
 */
export function useSelectedLayoutSegments(
  parallelRouteKey: string = 'children'
): string[] {
  clientHookInServerComponentError('useSelectedLayoutSegments')
  const { tree } = useContext(LayoutRouterContext)
  return getSelectedLayoutSegmentPath(tree, parallelRouteKey)
}

/**
 * A [Client Component](https://nextjs.org/docs/app/building-your-application/rendering/client-components) hook
 * that lets you read the active route segment **one level below** the Layout it is called from.
 *
 * @example
 * ```ts
 * 'use client'
 * import { useSelectedLayoutSegment } from 'next/navigation'
 *
 * export default function ExampleClientComponent() {
 *   const segment = useSelectedLayoutSegment()
 *
 *   return <p>Active segment: {segment}</p>
 * }
 * ```
 *
 * Read more: [Next.js Docs: `useSelectedLayoutSegment`](https://nextjs.org/docs/app/api-reference/functions/use-selected-layout-segment)
 */
export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
): string | null {
  clientHookInServerComponentError('useSelectedLayoutSegment')
  const selectedLayoutSegments = useSelectedLayoutSegments(parallelRouteKey)
  if (selectedLayoutSegments.length === 0) {
    return null
  }

  const selectedLayoutSegment =
    parallelRouteKey === 'children'
      ? selectedLayoutSegments[0]
      : selectedLayoutSegments[selectedLayoutSegments.length - 1]

  // if the default slot is showing, we return null since it's not technically "selected" (it's a fallback)
  // and returning an internal value like `__DEFAULT__` would be confusing.
  return selectedLayoutSegment === DEFAULT_SEGMENT_KEY
    ? null
    : selectedLayoutSegment
}

export { redirect, permanentRedirect, RedirectType } from './redirect'
export { notFound } from './not-found'
