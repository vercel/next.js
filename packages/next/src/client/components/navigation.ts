import type { Params } from '../../server/request/params'

import React, { useContext, useMemo, use } from 'react'
import {
  AppRouterContext,
  LayoutRouterContext,
  type AppRouterInstance,
} from '../../shared/lib/app-router-context.shared-runtime'
import {
  SearchParamsContext,
  PathnameContext,
  PathParamsContext,
  NavigationPromisesContext,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import {
  computeSelectedLayoutSegment,
  getSelectedLayoutSegmentPath,
} from '../../shared/lib/segment'
import { ReadonlyURLSearchParams } from './readonly-url-search-params'

const useDynamicRouteParams =
  typeof window === 'undefined'
    ? (
        require('../../server/app-render/dynamic-rendering') as typeof import('../../server/app-render/dynamic-rendering')
      ).useDynamicRouteParams
    : undefined

const useDynamicSearchParams =
  typeof window === 'undefined'
    ? (
        require('../../server/app-render/dynamic-rendering') as typeof import('../../server/app-render/dynamic-rendering')
      ).useDynamicSearchParams
    : undefined

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
// Client components API
export function useSearchParams(): ReadonlyURLSearchParams {
  useDynamicSearchParams?.('useSearchParams()')

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

  // Instrument with Suspense DevTools (dev-only)
  if (process.env.NODE_ENV !== 'production' && 'use' in React) {
    const navigationPromises = use(NavigationPromisesContext)
    if (navigationPromises) {
      return use(navigationPromises.searchParams)
    }
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
// Client components API
export function usePathname(): string {
  useDynamicRouteParams?.('usePathname()')

  // In the case where this is `null`, the compat types added in `next-env.d.ts`
  // will add a new overload that changes the return type to include `null`.
  const pathname = useContext(PathnameContext) as string

  // Instrument with Suspense DevTools (dev-only)
  if (process.env.NODE_ENV !== 'production' && 'use' in React) {
    const navigationPromises = use(NavigationPromisesContext)
    if (navigationPromises) {
      return use(navigationPromises.pathname)
    }
  }

  return pathname
}

// Client components API
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
// Client components API
export function useRouter(): AppRouterInstance {
  const router = useContext(AppRouterContext)
  if (router === null) {
    throw new Error('invariant expected app router to be mounted')
  }

  return router
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
// Client components API
export function useParams<T extends Params = Params>(): T {
  useDynamicRouteParams?.('useParams()')

  const params = useContext(PathParamsContext) as T

  // Instrument with Suspense DevTools (dev-only)
  if (process.env.NODE_ENV !== 'production' && 'use' in React) {
    const navigationPromises = use(NavigationPromisesContext)
    if (navigationPromises) {
      return use(navigationPromises.params) as T
    }
  }

  return params
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
// Client components API
export function useSelectedLayoutSegments(
  parallelRouteKey: string = 'children'
): string[] {
  useDynamicRouteParams?.('useSelectedLayoutSegments()')

  const context = useContext(LayoutRouterContext)
  // @ts-expect-error This only happens in `pages`. Type is overwritten in navigation.d.ts
  if (!context) return null

  // Instrument with Suspense DevTools (dev-only)
  if (process.env.NODE_ENV !== 'production' && 'use' in React) {
    const navigationPromises = use(NavigationPromisesContext)
    if (navigationPromises) {
      const promise =
        navigationPromises.selectedLayoutSegmentsPromises?.get(parallelRouteKey)
      if (promise) {
        // We should always have a promise here, but if we don't, it's not worth erroring over.
        // We just won't be able to instrument it, but can still provide the value.
        return use(promise)
      }
    }
  }

  return getSelectedLayoutSegmentPath(context.parentTree, parallelRouteKey)
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
// Client components API
export function useSelectedLayoutSegment(
  parallelRouteKey: string = 'children'
): string | null {
  useDynamicRouteParams?.('useSelectedLayoutSegment()')
  const navigationPromises = useContext(NavigationPromisesContext)
  const selectedLayoutSegments = useSelectedLayoutSegments(parallelRouteKey)

  // Instrument with Suspense DevTools (dev-only)
  if (
    process.env.NODE_ENV !== 'production' &&
    navigationPromises &&
    'use' in React
  ) {
    const promise =
      navigationPromises.selectedLayoutSegmentPromises?.get(parallelRouteKey)
    if (promise) {
      // We should always have a promise here, but if we don't, it's not worth erroring over.
      // We just won't be able to instrument it, but can still provide the value.
      return use(promise)
    }
  }

  return computeSelectedLayoutSegment(selectedLayoutSegments, parallelRouteKey)
}

export { unstable_isUnrecognizedActionError } from './unrecognized-action-error'

// Shared components APIs
export {
  notFound,
  forbidden,
  unauthorized,
  redirect,
  permanentRedirect,
  RedirectType,
  ReadonlyURLSearchParams,
  unstable_rethrow,
} from './navigation.react-server'
