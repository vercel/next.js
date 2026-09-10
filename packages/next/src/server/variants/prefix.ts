import { VARIANTS_PATH_PREFIX } from '../../lib/constants'
import { hashVariants } from './encoding'

/**
 * Matches the prefix at the start of a pathname and captures the hash.
 *
 * The hash is matched as `[0-9a-z]+`, which is the shape `hashVariants`
 * produces.
 */
const VARIANTS_PREFIX_PATTERN = new RegExp(
  `^/${VARIANTS_PATH_PREFIX}/([0-9a-z]+)`
)

/**
 * Splits a base path off a pathname, and returns the two parts.
 *
 * A base path belongs to a request, and a route knows nothing about it, so
 * every function here works on the remainder. The remainder always starts with
 * a slash.
 */
function splitBasePath(
  pathname: string,
  basePath: string | undefined
): [base: string, rest: string] {
  if (
    !basePath ||
    basePath === '/' ||
    (pathname !== basePath && !pathname.startsWith(`${basePath}/`))
  ) {
    return ['', pathname]
  }

  return [basePath, pathname.slice(basePath.length) || '/']
}

/**
 * Splits the variants prefix off a pathname, and returns null when the pathname
 * carries none.
 *
 * The base path stays on the remainder. Only the prefix is transport, and a
 * separate normalizer removes the base path afterwards.
 */
export function splitVariantsPrefix(
  pathname: string,
  basePath: string | undefined
): { hash: string; pathname: string } | null {
  const [base, rest] = splitBasePath(pathname, basePath)
  const match = VARIANTS_PREFIX_PATTERN.exec(rest)

  if (!match) {
    return null
  }

  const withoutPrefix = rest.slice(match[0].length)

  return {
    hash: match[1],
    pathname: withoutPrefix === '' ? base || '/' : `${base}${withoutPrefix}`,
  }
}

/**
 * Inserts the prefix into a pathname, after any base path.
 */
export function insertVariantsPrefix(
  pathname: string,
  hash: string,
  basePath: string | undefined
): string {
  const [base, rest] = splitBasePath(pathname, basePath)
  const prefix = `/${VARIANTS_PATH_PREFIX}/${hash}`

  return rest === '/' ? `${base}${prefix}` : `${base}${prefix}${rest}`
}

/**
 * Names the artifact of one prerendered route, and returns the pathname
 * unchanged for a route prerendered without variants.
 *
 * This takes no base path, because the build names route paths and a route path
 * carries none.
 */
export function getVariantOutputPath(
  pathname: string,
  variantValues: Readonly<Record<string, string>> | undefined
): string {
  if (!variantValues) {
    return pathname
  }

  return insertVariantsPrefix(pathname, hashVariants(variantValues), undefined)
}
