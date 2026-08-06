import { VARIANTS_PATH_PREFIX } from '../../lib/constants'
import { hashVariants } from './hash'

/**
 * The path that the artifacts of a prerendered route are written to and looked
 * up by.
 *
 * Combinations of one route share a pathname, and this prefix is what separates
 * them. Every site that correlates an artifact with the route that produced it
 * must derive the path in the same way. Therefore the prefix is defined here
 * once, and not applied at each site.
 */
const VARIANTS_PREFIX_PATTERN = new RegExp(
  `^/${VARIANTS_PATH_PREFIX}/([0-9a-z]+)`
)

/**
 * Splits a pathname into its base path and the part after it.
 *
 * The prefix goes on after the base path. Therefore every function here works
 * on the part after it, and the pattern above stays anchored to the start of
 * that part. One split serves the writer and the readers. If they disagreed
 * about where the prefix begins, a prefix would go on and never come off.
 */
function splitBasePath(
  pathname: string,
  basePath: string | undefined
): [base: string, rest: string] {
  if (!basePath || basePath === '/' || !pathname.startsWith(basePath)) {
    return ['', pathname]
  }

  const rest = pathname.slice(basePath.length)

  return [basePath, rest.startsWith('/') ? rest : `/${rest}`]
}

/**
 * Whether a pathname carries a variant prefix.
 *
 * This function matches the segment by its shape, and not against the set of
 * combinations that were prerendered. A combination that nobody enumerated is
 * still valid, and this function must still recognize it.
 */
export function hasVariantsPrefix(
  pathname: string,
  basePath?: string
): boolean {
  const [, rest] = splitBasePath(pathname, basePath)

  return VARIANTS_PREFIX_PATTERN.test(rest)
}

/**
 * The combination hash a pathname's prefix names, or null when it carries none.
 *
 * Callers read the hash before they remove the prefix, so that they do not also
 * discard which combination the request resolved to. The origin recovers the
 * declared values from this hash.
 */
export function readVariantsPrefixHash(
  pathname: string,
  basePath?: string
): string | null {
  const [, rest] = splitBasePath(pathname, basePath)

  return VARIANTS_PREFIX_PATTERN.exec(rest)?.[1] ?? null
}

/**
 * Removes a variant prefix, and gives the route that the path belongs to.
 *
 * The prefix is transport. It is not part of the declared path of any route, so
 * it comes off before the request is matched. Later code decides what the
 * combination selects, from the values that travelled beside it, and it does so
 * by keying the artifact rather than by matching a different route.
 */
export function removeVariantsPrefix(
  pathname: string,
  basePath?: string
): string {
  const [base, rest] = splitBasePath(pathname, basePath)
  const withoutPrefix = rest.replace(VARIANTS_PREFIX_PATTERN, '')

  // The base path stays on. Only the prefix is transport; a later normalizer
  // removes the base path, and route matching runs after both.
  return withoutPrefix === '' ? base || '/' : `${base}${withoutPrefix}`
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
 * Inserts a variant combination as a path prefix.
 *
 * The prefix goes in after `basePath`, so that it contains the whole remaining
 * path, including any locale segment. The transform is then the same whether or
 * not the project uses i18n.
 *
 * `segment` is the hash of the combination, in a request path and in a path on
 * disk alike. A request must arrive at the artifact the build wrote, so both
 * are named in the same way. In a request URL the result is an internal
 * pathname. `VariantsPathnameNormalizer` removes it again before route
 * resolution, and the client never sees it. Nothing can read a hash back into
 * values, so the values travel beside it in `NEXT_VARIANTS_HEADER`.
 */
export function insertVariantsPrefix(
  pathname: string,
  segment: string,
  basePath?: string
): string {
  const [base, rest] = splitBasePath(pathname, basePath)
  const prefix = `/${VARIANTS_PATH_PREFIX}/${segment}`

  return rest === '/' ? `${base}${prefix}` : `${base}${prefix}${rest}`
}
