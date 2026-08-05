import type { Variant } from '../request/variants'

import { isDynamicRoute } from '../../shared/lib/router/utils'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { sortPages } from '../../shared/lib/router/utils/sortable-routes'

/**
 * The variants each route reads, keyed by page.
 *
 * A route reads the variants its own module graph does, layouts included, and
 * resolving any others would call a `decide` for a value nothing can consume.
 * That matters beyond wasted work: a value the route never reads would still
 * travel to the origin as an unmatched variant, which is what tells the render
 * a request could not be served from a prerender.
 *
 * The transform will synthesize this from the module graph. Until then a
 * project writes it by hand, which is why the keys are page patterns rather
 * than regexes.
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
 * Compiles the table into matchers, once per process rather than per request.
 *
 * Concrete pages are kept apart from dynamic ones and consulted first, so that
 * `/paramless` is never captured by some `/[slug]`. Dynamic routes keep the
 * order `sortPages` gives them, which is the order route matching resolves them
 * in everywhere else. This mirrors `findVariantGroupsForPathname`, because the
 * two have to agree on which route a pathname belongs to: one decides what is
 * resolved and the other what it is matched against.
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
 * The variants the route serving `pathname` reads, empty when no route of ours
 * does.
 *
 * Empty is an ordinary answer: most routes read none, and a request for one of
 * them resolves nothing and carries nothing.
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
