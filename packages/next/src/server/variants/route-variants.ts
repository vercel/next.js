import type { Variant } from '../request/variants'

import { isDynamicRoute } from '../../shared/lib/router/utils'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { sortPages } from '../../shared/lib/router/utils/sortable-routes'

/**
 * The variants each route reads, keyed by page.
 *
 * A route reads the variants that its own module graph reads, layouts included.
 * To resolve any other variant would call a `decide` for a value that nothing
 * can consume. The cost is more than the wasted work: a value the route never
 * reads still travels to the origin as an unmatched variant, and an unmatched
 * variant is what tells the render that no prerender can serve the request.
 *
 * The transform will build this table from the module graph. Until then a
 * project writes it by hand, which is why the keys are page patterns and not
 * regexes.
 */
export type VariantsByRoute = Readonly<Record<string, ReadonlyArray<Variant>>>

interface RouteVariantMatchers {
  staticRoutes: Readonly<Record<string, ReadonlyArray<Variant>>>
  dynamicRoutes: ReadonlyArray<{
    matcher: RegExp
    variants: ReadonlyArray<Variant>
  }>
}

/**
 * Compiles the table into matchers, once per process and not once per request.
 *
 * Concrete pages are held apart from dynamic ones, and are consulted first, so
 * that no `/[slug]` can capture `/paramless`. Dynamic routes keep the order
 * that `sortPages` gives them, which is the order route matching resolves them
 * in everywhere else. This function mirrors `findVariantGroupsForPathname`. The
 * two must agree on which route a pathname belongs to, because one decides what
 * is resolved and the other decides what it is matched against.
 */
export function compileRouteVariants(
  variantsByRoute: VariantsByRoute
): RouteVariantMatchers {
  const staticRoutes: Record<string, ReadonlyArray<Variant>> = {}
  const dynamicPages: string[] = []

  for (const page of Object.keys(variantsByRoute)) {
    if (isDynamicRoute(page)) {
      dynamicPages.push(page)
    } else {
      staticRoutes[page] = variantsByRoute[page]
    }
  }

  return {
    staticRoutes,
    dynamicRoutes: sortPages(dynamicPages).map((page) => ({
      matcher: getRouteRegex(page).re,
      variants: variantsByRoute[page],
    })),
  }
}

/**
 * The variants that the route serving `pathname` reads. The result is empty
 * when no route of ours reads any.
 *
 * An empty result is an ordinary answer. Most routes read no variant, and a
 * request for one of them resolves nothing and carries nothing.
 */
export function findVariantsForPathname(
  matchers: RouteVariantMatchers,
  pathname: string
): ReadonlyArray<Variant> {
  const staticVariants = matchers.staticRoutes[pathname]

  if (staticVariants) {
    return staticVariants
  }

  for (const { matcher, variants } of matchers.dynamicRoutes) {
    if (matcher.test(pathname)) {
      return variants
    }
  }

  return []
}
