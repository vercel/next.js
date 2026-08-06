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
  `^/${VARIANTS_PATH_PREFIX}/([0-9a-z]+)`
)

/**
 * A pathname split into its base path and the part after it.
 *
 * The prefix goes on after the base path, so every function here works on the
 * part after it and the pattern above stays anchored to the start of that part.
 * One split serves the writer and the readers. If they disagreed about where
 * the prefix begins, a prefix would go on and never come off.
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
 * The segment is matched by shape rather than against the set of combinations
 * that were prerendered, because a combination nobody enumerated is still valid
 * and still has to be recognized here.
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
 * Read before the prefix comes off, so that stripping the path does not also
 * discard which combination the request resolved to. The hash is what the
 * origin recovers the declared values from.
 */
export function readVariantsPrefixHash(
  pathname: string,
  basePath?: string
): string | null {
  const [, rest] = splitBasePath(pathname, basePath)

  return VARIANTS_PREFIX_PATTERN.exec(rest)?.[1] ?? null
}

/**
 * Removes a variant prefix, yielding the route the path belongs to.
 *
 * The prefix is transport, not part of any route's declared path, so it comes
 * off before the request is matched. What the combination selects is decided
 * afterwards from the values that travelled beside it, by keying the artifact
 * rather than by matching a different route.
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
  const [base, rest] = splitBasePath(pathname, basePath)
  const prefix = `/${VARIANTS_PATH_PREFIX}/${segment}`

  return rest === '/' ? `${base}${prefix}` : `${base}${prefix}${rest}`
}
