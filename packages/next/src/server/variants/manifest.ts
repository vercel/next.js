import type { VariantCombinationGroups } from './combinations'

/**
 * The combinations each route declared, in the form the proxy can match a
 * request against.
 *
 * The prerender manifest already carries the same groups keyed by page, but the
 * origin is handed a route that routing already resolved, whereas the proxy
 * runs before any of ours does and has only a pathname. So this one carries
 * what it takes to get from a pathname to a route, and nothing else.
 *
 * Static and dynamic routes are kept apart, and static ones are consulted
 * first, so that a concrete page always wins over a dynamic route that would
 * also match it. This mirrors how the platform's own edge wrapper resolves a
 * page.
 */
export interface VariantsManifest {
  version: 1
  /**
   * Keyed by the exact pathname the route is served at.
   */
  staticRoutes: Record<string, VariantCombinationGroups>
  /**
   * Ordered most specific first, each matched by its route regex.
   */
  dynamicRoutes: Array<{
    /**
     * The source of a `RegExp` matching the pathnames this route serves.
     */
    regex: string
    groups: VariantCombinationGroups
  }>
}

/**
 * Compiled matchers for a manifest's dynamic routes, built once per manifest
 * rather than per request.
 *
 * The manifest arrives as JSON read once per process, so it is stable enough to
 * key on, and compiling a `RegExp` per dynamic route per request would be paid
 * on every request the proxy handles.
 */
const matchersByManifest = new WeakMap<
  VariantsManifest,
  Array<{ matcher: RegExp; groups: VariantCombinationGroups }>
>()

function getDynamicMatchers(
  manifest: VariantsManifest
): Array<{ matcher: RegExp; groups: VariantCombinationGroups }> {
  let matchers = matchersByManifest.get(manifest)

  if (!matchers) {
    matchers = manifest.dynamicRoutes.map(({ regex, groups }) => ({
      matcher: new RegExp(regex),
      groups,
    }))

    matchersByManifest.set(manifest, matchers)
  }

  return matchers
}

/**
 * The combinations declared for the route serving `pathname`, or null when the
 * pathname belongs to no route that declared any.
 *
 * Null is the ordinary answer rather than a failure: most routes declare
 * nothing, and a request for one of them is served the artifact that bakes no
 * variant.
 */
export function findVariantGroupsForPathname(
  manifest: VariantsManifest,
  pathname: string
): VariantCombinationGroups | null {
  const staticGroups = manifest.staticRoutes[pathname]

  if (staticGroups) {
    return staticGroups
  }

  for (const { matcher, groups } of getDynamicMatchers(manifest)) {
    if (matcher.test(pathname)) {
      return groups
    }
  }

  return null
}
