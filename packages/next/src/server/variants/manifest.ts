import type { VariantCombinationGroups } from './combinations'

/**
 * The static variant combinations with a prefixed prerender output, in the form
 * a proxy needs. A page that declared combinations remains present with empty
 * groups when none produced an output.
 *
 * A proxy runs before any routing of ours, so it cannot look a page up by name.
 * It matches a pathname first, which is why this holds route regexes where the
 * prerender manifest holds page keys.
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
 * Compiled dynamic-route matchers for one manifest.
 *
 * The manifest is JSON read once per process, so its object identity is stable
 * enough to key on, and each regex is compiled once rather than per request.
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
 * Finds the variant combination groups with an available output for the route
 * that serves a pathname. It returns null when no manifest route matches.
 *
 * A static route is looked up by pathname before any regex is tested, so a
 * concrete route wins over a dynamic one that would also match it.
 */
export function findVariantGroupsForPathname(
  manifest: VariantsManifest,
  pathname: string
): VariantCombinationGroups | null {
  // `hasOwn`, because the pathname comes from a request and the manifest is a
  // plain object parsed from JSON. Indexing it directly answers a pathname such
  // as `__proto__` with a prototype member.
  if (Object.hasOwn(manifest.staticRoutes, pathname)) {
    return manifest.staticRoutes[pathname]
  }

  for (const { matcher, groups } of getDynamicMatchers(manifest)) {
    if (matcher.test(pathname)) {
      return groups
    }
  }

  return null
}
