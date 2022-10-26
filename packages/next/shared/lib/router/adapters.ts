import type { ParsedUrlQuery } from 'node:querystring'
import { AppRouterInstance } from '../app-router-context'
import { NextRouter } from './router'

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
export function adaptForSearchParams(router: NextRouter): URLSearchParams {
  if (!router.isReady || !router.query) {
    return new URLSearchParams()
  }

  return transformQuery(router.query)
}

/**
 * adaptForPathname adapts the `asPath` parameter from the router to a pathname.
 *
 * @param asPath the asPath parameter to transform that comes from the router
 * @returns pathname part of `asPath`
 */
export function adaptForPathname(asPath: string): string {
  const url = new URL(asPath, 'http://f')
  return url.pathname
}
