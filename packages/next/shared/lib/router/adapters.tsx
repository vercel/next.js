import type { ParsedUrlQuery } from 'node:querystring'
import React, { useMemo } from 'react'
import type { AppRouterInstance } from '../app-router-context'
import { PathnameContext } from '../hooks-client-context'
import type { NextRouter } from './router'
import { isDynamicRoute } from './utils'

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
    push(href: string): void {
      void router.push(href)
    },
    replace(href: string): void {
      void router.replace(href)
    },
    prefetch(href: string): void {
      void router.prefetch(href)
    },
  }
}

/**
 * transforms the ParsedUrlQuery into a URLSearchParams.
 *
 * @param query the query to transform
 * @returns URLSearchParams
 */
function transformQuery(query: ParsedUrlQuery): URLSearchParams {
  const params = new URLSearchParams()

  for (const [name, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const val of value) {
        params.append(name, val)
      }
    } else if (typeof value !== 'undefined') {
      params.append(name, value)
    }
  }

  return params
}

/**
 * adaptForSearchParams transforms the ParsedURLQuery into URLSearchParams.
 *
 * @param router the router that contains the query.
 * @returns the search params in the URLSearchParams format
 */
export function adaptForSearchParams(
  router: Pick<NextRouter, 'isReady' | 'query'>
): URLSearchParams {
  if (!router.isReady || !router.query) {
    return new URLSearchParams()
  }

  return transformQuery(router.query)
}

export function PathnameContextProviderAdapter({
  children,
  router,
  isAutoExport,
  isFallback,
}: React.PropsWithChildren<{
  router: Pick<NextRouter, 'pathname' | 'asPath'>
  isAutoExport: boolean
  isFallback: boolean
}>) {
  const value = useMemo(() => {
    // If this is a dynamic route with auto export or fallback is true...
    if (isDynamicRoute(router.pathname) && (isAutoExport || isFallback)) {
      // Return null. This will throw an error when accessed via `usePathname`,
      // but it provides the correct API for folks considering the new router
      // does not support `isReady`.
      return null
    }

    const url = new URL(router.asPath, 'http://f')
    return url.pathname
  }, [router.pathname, router.asPath, isAutoExport, isFallback])

  return (
    <PathnameContext.Provider value={value}>
      {children}
    </PathnameContext.Provider>
  )
}
