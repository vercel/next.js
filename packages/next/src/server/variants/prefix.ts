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
const VARIANTS_PREFIX_PATTERN = new RegExp(
  `^/${VARIANTS_PATH_PREFIX}/[0-9a-z]+`
)

/**
 * Whether a pathname carries a variant prefix.
 *
 * The segment is matched by shape rather than against the set of combinations
 * that were prerendered, because a combination nobody enumerated is still valid
 * and still has to be recognized here.
 */
export function hasVariantsPrefix(pathname: string): boolean {
  return VARIANTS_PREFIX_PATTERN.test(pathname)
}

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
 * `segment` is the combination's hash, in request paths and paths on disk
 * alike: a request has to arrive at the artifact the build wrote, so both are
 * named the same way. In a request URL the result is an internal pathname,
 * stripped again by `VariantsPathnameNormalizer` before route resolution and
 * never visible to the client. Because a hash cannot be read back into values,
 * the values travel beside it in `NEXT_VARIANTS_HEADER`.
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
