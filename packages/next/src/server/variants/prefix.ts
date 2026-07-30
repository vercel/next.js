import { VARIANTS_PATH_PREFIX } from '../../lib/constants'
import { hashVariants } from './hash'

/**
 * The path a prerendered route's artifacts are written to and looked up by.
 *
 * Combinations of the same route share a pathname, so this is what separates
 * them. Anything correlating an artifact with the route that produced it has to
 * derive the path the same way, which is why this exists rather than the prefix
 * being applied at each site.
 */
const VARIANTS_PREFIX_PATTERN = new RegExp(`^/${VARIANTS_PATH_PREFIX}/[^/]+`)

/**
 * Removes a variant prefix, yielding the route the path belongs to.
 *
 * Needed wherever something is keyed by route rather than by combination, such
 * as the prerender manifest: every combination of a route shares its cache
 * control, so a lookup there has to ask about the route, not the artifact.
 */
export function removeVariantsPrefix(pathname: string): string {
  const withoutPrefix = pathname.replace(VARIANTS_PREFIX_PATTERN, '')

  return withoutPrefix === '' ? '/' : withoutPrefix
}

export function getVariantOutputPath(
  pathname: string,
  variantValues: Readonly<Record<string, string>> | undefined
): string {
  if (!variantValues) {
    return pathname
  }

  return insertVariantsPrefix(pathname, hashVariants(variantValues))
}

/**
 * Inserts a variant combination as a path prefix, after `basePath` so that the
 * prefix wraps the entire remaining path (including any locale segment) and the
 * transform stays uniform regardless of i18n.
 *
 * `segment` identifies the combination, and which form it takes depends on
 * which path is being built. A request URL carries the packed values, because
 * the server has to read them back to serve the request, and the result is an
 * internal pathname stripped again by `VariantsPathnameNormalizer` before route
 * resolution, never visible to the client. A path on disk carries the hash
 * instead, because values may contain characters that are illegal in filenames
 * and nothing needs to read them back from there.
 */
export function insertVariantsPrefix(
  pathname: string,
  segment: string,
  basePath?: string
): string {
  const prefix = `/${VARIANTS_PATH_PREFIX}/${segment}`

  if (basePath && basePath !== '/' && pathname.startsWith(basePath)) {
    const rest = pathname.slice(basePath.length)
    return `${basePath}${prefix}${rest.startsWith('/') ? rest : `/${rest}`}`
  }

  return pathname === '/' ? prefix : `${prefix}${pathname}`
}
