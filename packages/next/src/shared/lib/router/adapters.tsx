import type {
  AppRouterInstance,
  NavigateOptions,
} from '../app-router-context.shared-runtime'
import type { Params } from './utils/route-matcher'
import type { NextRouter } from './router'

import React, { useMemo, useRef } from 'react'
import { PathnameContext } from '../hooks-client-context.shared-runtime'
import { isDynamicRoute } from './utils'
import { asPathToSearchParams } from './utils/as-path-to-search-params'
import { getRouteRegex } from './utils/route-regex'

/**
 * adaptForAppRouterInstance implements the AppRouterInstance with a NextRouter.
 *
 * @param router the NextRouter to adapt
 * @returns an AppRouterInstance
 */
export function adaptForAppRouterInstance(
  router: NextRouter
): AppRouterInstance {
  return {
    back(): void {
      router.back()
    },
    forward(): void {
      router.forward()
    },
    refresh(): void {
      router.reload()
    },
    push(href: string, { scroll }: NavigateOptions = {}): void {
      void router.push(href, undefined, { scroll })
    },
    replace(href: string, { scroll }: NavigateOptions = {}): void {
      void router.replace(href, undefined, { scroll })
    },
    prefetch(href: string): void {
      void router.prefetch(href)
    },
  }
}

/**
 * adaptForSearchParams transforms the ParsedURLQuery into URLSearchParams.
 *
 * @param router the router that contains the query.
 * @returns the search params in the URLSearchParams format
 */
export function adaptForSearchParams(
  router: Pick<NextRouter, 'isReady' | 'query' | 'asPath'>
): URLSearchParams {
  if (!router.isReady || !router.query) {
    return new URLSearchParams()
  }

  return asPathToSearchParams(router.asPath)
}

export function adaptForPathParams(
  router: Pick<NextRouter, 'isReady' | 'pathname' | 'query' | 'asPath'>
): Params | null {
  if (!router.isReady || !router.query) {
    return null
  }
  const pathParams: Params = {}
  const routeRegex = getRouteRegex(router.pathname)
  const keys = Object.keys(routeRegex.groups)
  for (const key of keys) {
    pathParams[key] = router.query[key]!
  }
  return pathParams
}

export function PathnameContextProviderAdapter({
  children,
  router,
  ...props
}: React.PropsWithChildren<{
  router: Pick<NextRouter, 'pathname' | 'asPath' | 'isReady' | 'isFallback'>
  isAutoExport: boolean
}>) {
  const ref = useRef(props.isAutoExport)
  const value = useMemo(() => {
    // isAutoExport is only ever `true` on the first render from the server,
    // so reset it to `false` after we read it for the first time as `true`. If
    // we don't use the value, then we don't need it.
    const isAutoExport = ref.current
    if (isAutoExport) {
      ref.current = false
    }

    // When the route is a dynamic route, we need to do more processing to
    // determine if we need to stop showing the pathname.
    if (isDynamicRoute(router.pathname)) {
      // When the router is rendering the fallback page, it can't possibly know
      // the path, so return `null` here. Read more about fallback pages over
      // at:
      // https://nextjs.org/docs/api-reference/data-fetching/get-static-paths#fallback-pages
      if (router.isFallback) {
        return null
      }

      // When `isAutoExport` is true, meaning this is a page page has been
      // automatically statically optimized, and the router is not ready, then
      // we can't know the pathname yet. Read more about automatic static
      // optimization at:
      // https://nextjs.org/docs/advanced-features/automatic-static-optimization
      if (isAutoExport && !router.isReady) {
        return null
      }
    }

    // The `router.asPath` contains the pathname seen by the browser (including
    // any query strings), so it should have that stripped. Read more about the
    // `asPath` option over at:
    // https://nextjs.org/docs/api-reference/next/router#router-object
    let url: URL
    try {
      url = new URL(router.asPath, 'http://f')
    } catch (_) {
      // fallback to / for invalid asPath values e.g. //
      return '/'
    }

    return url.pathname
  }, [router.asPath, router.isFallback, router.isReady, router.pathname])

  return (
    <PathnameContext.Provider value={value}>
      {children}
    </PathnameContext.Provider>
  )
}
