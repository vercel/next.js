import type { Variant } from '../request/variants'

import { isDynamicRoute } from '../../shared/lib/router/utils'
import { getRouteRegex } from '../../shared/lib/router/utils/route-regex'
import { sortPages } from '../../shared/lib/router/utils/sortable-routes'

/**
 * The variants that each route reads, keyed by page.
 *
 * A route reads the variants that its own module graph reads, layouts included.
 * This table names only those. A `decide` for any other variant produces a
 * value that no code reads, and the request then sends that value to the origin
 * for nothing.
 *
 * The keys are page patterns, and not regular expressions, because a project
 * currently writes this table by hand.
 *
 * TODO(variants): the variants transform will build the table from the module
 * graph instead.
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
 * Compiles the table into matchers.
 *
 * The function keeps concrete pages apart from dynamic ones, and consults them
 * first, so that `/[slug]` cannot capture `/paramless`. Dynamic pages keep the
 * order that `sortPages` gives them, which is the order that route matching
 * uses everywhere else.
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
 * The variants that the route for `pathname` reads.
 *
 * The result is empty when the table names none for that pathname. That is an
 * ordinary answer, and the request then resolves nothing.
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
