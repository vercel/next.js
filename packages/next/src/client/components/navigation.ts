import type { Params } from '../../server/request/params'

import React, { useContext, useMemo, use } from 'react'
import {
  AppRouterContext,
  LayoutRouterContext,
  GlobalLayoutRouterContext,
  type AppRouterInstance,
} from '../../shared/lib/app-router-context.shared-runtime'
import {
  SearchParamsContext,
  PathnameContext,
  PathParamsContext,
  NavigationPromisesContext,
  ReadonlyURLSearchParams,
} from '../../shared/lib/hooks-client-context.shared-runtime'
import {
  computeSelectedLayoutSegment,
  getSelectedLayoutSegmentPath,
} from '../../shared/lib/segment'
import { computeRelativeHref } from '../../shared/lib/relative-href'

import {
  trackDynamicRouteParamsAccess,
  trackDynamicSearchParamsAccess,
} from './navigation-dynamic-rendering'

const {
  instrumentParamsForClientValidation,
  instrumentSearchParamsForClientValidation,
  expectCompleteParamsInClientValidation,
} = process.env.__NEXT_CACHE_COMPONENTS
  ? (require('./instant-samples') as typeof import('./instant-samples'))
  : {}

/**
 * Marks the calling hook's output as depending on the route params. The
 * tracker (server-only; undefined in the browser) returns a hanging promise
 * when a prerender must block on the unknown param values; suspending on it
 * with `use` is done here, in a hook, where it belongs.
 */
function useDynamicRouteParams(expression: string) {
  const hangingPromise = trackDynamicRouteParamsAccess?.(expression)
  if (hangingPromise !== undefined) {
    use(hangingPromise)
  }
}

/**
 * Like `useDynamicRouteParams`, but for search params, which are always
 * request-time values.
 */
function useDynamicSearchParams(expression: string) {
  const hangingPromise = trackDynamicSearchParamsAccess?.(expression)
  if (hangingPromise !== undefined) {
    use(hangingPromise)
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
// Client components API
export function useSearchParams(): ReadonlyURLSearchParams {
  useDynamicSearchParams('useSearchParams()')

  const searchParams = useContext(SearchParamsContext)

  // In the case where this is `null`, the compat types added in
  // `next-env.d.ts` will add a new overload that changes the return type to
  // include `null`.
  const readonlySearchParams = useMemo((): ReadonlyURLSearchParams => {
    if (!searchParams) {
      // When the router is not ready in pages, we won't have the search params
      // available.
      return null!
    }

    return new ReadonlyURLSearchParams(searchParams)
  }, [searchParams])

  // During build-time instant validation, wrap with an proxy
  // so that accessing undeclared search params throws an error.
  if (
    typeof window === 'undefined' &&
    process.env.__NEXT_CACHE_COMPONENTS &&
    readonlySearchParams
  ) {
    return instrumentSearchParamsForClientValidation!(readonlySearchParams)
  }

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
  useDynamicRouteParams('usePathname()')

  // In the case where this is `null`, the compat types added in `next-env.d.ts`
  // will add a new overload that changes the return type to include `null`.
  const pathname = useContext(PathnameContext) as string

  // During build-time instant validation, error if fallback params exist
  // because usePathname() can't return a sensible value without all params.
  if (
    typeof window === 'undefined' &&
    process.env.__NEXT_CACHE_COMPONENTS &&
    pathname
  ) {
    expectCompleteParamsInClientValidation!('usePathname()')
    return pathname
  }

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

  // Read the bfcacheId of the closest CacheNode and merge it into the
  // returned router instance. This is contextual: callers in a shared
  // layout get the layout's id; callers in a leaf segment get the leaf's.
  // The id is stored on the CacheNode as a number and materialized as a
  // string here. The format mirrors React's `useId()` (e.g. `_r_0_`) with
  // a `b` prefix, so the id can be safely concatenated with other keys
  // without collision.
  const layout = useContext(LayoutRouterContext)
  const bfcacheIdNumber = layout?.parentCacheNode.bfcacheId ?? 0
  return useMemo<AppRouterInstance>(
    () => ({
      back: router.back,
      forward: router.forward,
      refresh: router.refresh,
      hmrRefresh: router.hmrRefresh,
      push: router.push,
      replace: router.replace,
      prefetch: router.prefetch,
      experimental_gesturePush: router.experimental_gesturePush,
      bfcacheId: '_b_' + bfcacheIdNumber + '_',
    }),
    [router, bfcacheIdNumber]
  )
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
  useDynamicRouteParams('useParams()')

  const params = useContext(PathParamsContext) as T

  // During build-time instant validation, wrap with a proxy
  // so that accessing undeclared params throws an error.
  if (
    typeof window === 'undefined' &&
    process.env.__NEXT_CACHE_COMPONENTS &&
    params
  ) {
    return instrumentParamsForClientValidation!(params)
  }

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
  useDynamicRouteParams('useSelectedLayoutSegments()')

  const context = useContext(LayoutRouterContext)
  // @ts-expect-error This only happens in `pages`. Type is overwritten in navigation.d.ts
  if (!context) return null

  // During build-time instant validation, error if fallback params exist
  // because useSelectedLayoutSegments() can't return a sensible value without all params.
  if (
    typeof window === 'undefined' &&
    process.env.__NEXT_CACHE_COMPONENTS &&
    context
  ) {
    expectCompleteParamsInClientValidation!('useSelectedLayoutSegments()')
  }

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
  useDynamicRouteParams('useSelectedLayoutSegment()')
  const navigationPromises = useContext(NavigationPromisesContext)
  const selectedLayoutSegments = useSelectedLayoutSegments(parallelRouteKey)

  // During build-time instant validation, error if fallback params exist
  // because useSelectedLayoutSegment() can't return a sensible value without all params.
  if (typeof window === 'undefined' && process.env.__NEXT_CACHE_COMPONENTS) {
    expectCompleteParamsInClientValidation!('useSelectedLayoutSegment()')
  }

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

/**
 * A [Client Component](https://nextjs.org/docs/app/building-your-application/rendering/client-components) hook
 * that computes a relative URL reference from the current page to a target
 * route pattern. The result resolves to the target route's URL path; its
 * path portion always ends in `/`, so child segments can be appended
 * directly. A query and/or hash in the target is preserved in the result.
 *
 * Dynamic segments in the target take their values from the current route
 * where the target overlaps it, so the target can be a route pattern like
 * `'/chat/[id]'` — no knowledge of the current param values is required.
 *
 * Targets that aren't root-relative paths — absolute URLs (`https://…`,
 * `mailto:…`), protocol-relative URLs, and hash- or query-only references
 * (`#faq`, `?tab=1`) — are returned unchanged, so any href that's valid on
 * a `<Link>` can be passed through the hook without changing its behavior.
 *
 * @example
 * ```ts
 * 'use client'
 * import { unstable_useRelativeHref } from 'next/navigation'
 *
 * export default function ExampleClientComponent() {
 *   // On /acme/settings (route /[teamId]/settings), returns './dashboard/'.
 *   // On /acme/settings/billing, returns '../dashboard/'.
 *   const dashboardHref = unstable_useRelativeHref('/[teamId]/dashboard')
 *   // ...
 * }
 * ```
 *
 * In the Pages Router the returned value is `null`; the compat types added
 * in `next-env.d.ts` widen the return type to include `null` there.
 */
// Client components API
// Exported publicly as `unstable_useRelativeHref` (see below); named
// `useRelativeHref` here so React's rules-of-hooks tooling recognizes it as
// a hook.
function useRelativeHref(target: string): string {
  // TODO: Type the target argument against the generated route types
  // (`Route`), like typed `<Link>` hrefs. For now it's a plain string.
  //
  // The current page's URL parts (`matchedRoute`) are resolved once per
  // router state by AppRouter: the server-computed matched route on the
  // initial render, the URL pathname (the same source usePathname reads)
  // after that. In the Pages Router the context has no provider and the
  // hook returns null.
  const context = useContext(GlobalLayoutRouterContext)

  const href = useMemo(() => {
    if (context === null) {
      return null
    }
    return computeRelativeHref(
      target,
      context.matchedRoute,
      Boolean(process.env.__NEXT_TRAILING_SLASH)
    )
  }, [context, target])

  // A null href means it would read values that don't exist yet (see
  // computeRelativeHref), which only happens while prerendering a fallback
  // shell: deopt to dynamic rendering. Suspending on the tracker's hanging
  // promise makes this component a dynamic hole, filled in at request time
  // when the values exist; hrefs that are invariant to the unknown values
  // come out as strings and stay in the static shell. The tracker isn't a
  // hook, so it may be called conditionally, and `use` (unlike other
  // hooks) is allowed in conditional code.
  if (context !== null && href === null) {
    const hangingPromise = trackDynamicRouteParamsAccess?.(
      'unstable_useRelativeHref()'
    )
    if (hangingPromise !== undefined) {
      use(hangingPromise)
    }
  }

  // Instrument with Suspense DevTools (dev-only). Every instance of this
  // hook conceptually blocks on the same thing — the resolved router
  // state — so they all share a single named promise (see
  // NavigationPromises). Unlike the sibling hooks, the promise's value is
  // not the hook's return value, so it isn't returned here.
  if (process.env.NODE_ENV !== 'production' && 'use' in React) {
    const navigationPromises = use(NavigationPromisesContext)
    if (navigationPromises !== null) {
      use(navigationPromises.relativeHref)
    }
  }

  // `href` is null only in the Pages Router (context has no provider),
  // where the compat types widen the return type to include `null` (see
  // above).
  return href as string
}

export { useRelativeHref as unstable_useRelativeHref }

export { unstable_isUnrecognizedActionError } from './unrecognized-action-error'

// Shared components APIs
export {
  // We need the same class that was used to instantiate the context value
  // Otherwise instanceof checks will fail in usercode
  ReadonlyURLSearchParams,
}
export {
  notFound,
  forbidden,
  unauthorized,
  redirect,
  permanentRedirect,
  RedirectType,
  unstable_rethrow,
} from './navigation.react-server'
