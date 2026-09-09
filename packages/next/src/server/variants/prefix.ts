import {
  NEXT_INTERCEPTION_MARKER_PREFIX,
  NEXT_QUERY_PARAM_PREFIX,
  NEXT_VARIANTS_QUERY_PARAM,
  VARIANTS_NOT_ROUTED_PATH,
  VARIANTS_PATH_PREFIX,
} from '../../lib/constants'
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
 * The query keys that name a static variant combination once routing has
 * processed them. Routing writes `NEXT_VARIANTS_QUERY_PARAM` itself, and it
 * writes it after a request arrives, so any of these keys on an incoming
 * request came from the client.
 *
 * The prefixed spellings are listed because `normalizeNextQueryParam` removes
 * one `nxtP` or `nxtI` prefix from a query key before a route reads it.
 */
export const VARIANTS_SELECTOR_QUERY_KEYS: readonly string[] = [
  NEXT_VARIANTS_QUERY_PARAM,
  `${NEXT_QUERY_PARAM_PREFIX}${NEXT_VARIANTS_QUERY_PARAM}`,
  `${NEXT_INTERCEPTION_MARKER_PREFIX}${NEXT_VARIANTS_QUERY_PARAM}`,
]

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
 * Returns true when a pathname names the artifact namespace after any base
 * path. The namespace is `/__variants/` and everything under it.
 *
 * Unlike `splitVariantsPrefix`, which parses a prefix the framework wrote, this
 * checks a pathname a client sent. It therefore also decodes the pathname and
 * normalizes its slashes, because a server does the same before it looks an
 * artifact up, so an encoded spelling reaches the same artifact as the plain
 * one.
 */
export function hasVariantsPathPrefix(
  pathname: string,
  basePath: string | undefined
): boolean {
  for (const candidate of [pathname, decodePathname(pathname)]) {
    if (candidate === null) {
      continue
    }

    const normalized = candidate.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
    const [, rest] = splitBasePath(normalized, basePath)

    if (rest.startsWith(`/${VARIANTS_PATH_PREFIX}/`)) {
      return true
    }
  }

  return false
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

/**
 * Returns true when the query keys name a static variant combination.
 */
export function hasVariantsSelector(queryKeys: Iterable<string>): boolean {
  for (const key of queryKeys) {
    if (VARIANTS_SELECTOR_QUERY_KEYS.includes(key)) {
      return true
    }
  }

  return false
}

/**
 * The pathname that routing rewrites a rejected request to, after any base
 * path.
 */
export function getVariantsNotRoutedPathname(
  basePath: string | undefined
): string {
  const base = basePath && basePath !== '/' ? basePath : ''

  return `${base}/${VARIANTS_NOT_ROUTED_PATH}`
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
