import type { VariantCombinationGroups } from './combinations'

/**
 * The combinations each route declared, in the form the proxy can match a
 * request against.
 *
 * The prerender manifest carries the same groups keyed by page. The origin can
 * use those, because routing hands it a route it has already resolved. The
 * proxy cannot: it runs before any routing of ours, and it has only a pathname.
 * Therefore this manifest carries what it takes to get from a pathname to a
 * route, and nothing else.
 *
 * Static and dynamic routes are held apart, and static ones are consulted
 * first, so that a concrete page always takes precedence over a dynamic route
 * that also matches it. This mirrors how the edge wrapper of the platform
 * resolves a page.
 */
export interface VariantsManifest {
  version: 1
  /**
   * The key is the exact pathname the route is served at.
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
 * Compiled matchers for the dynamic routes of a manifest, built once per
 * manifest and not once per request.
 *
 * The manifest is JSON that is read once per process, so it is stable enough to
 * key on. Without this cache, the proxy would compile one `RegExp` per dynamic
 * route on every request it handles.
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
 * Null is an ordinary answer and not a failure. Most routes declare no
 * combination, and the server sends a request for one of them the artifact that
 * contains no variant value.
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
