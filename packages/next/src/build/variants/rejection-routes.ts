import type { RouteHas } from '../../lib/load-custom-routes'

import path from 'node:path'
import {
  NEXT_VARIANTS_PREFIX_HEADER,
  VARIANTS_NOT_ROUTED_PATH,
  VARIANTS_PATH_PREFIX,
} from '../../lib/constants'
import { VARIANTS_SELECTOR_QUERY_KEYS } from '../../server/variants/prefix'
import { escapeStringRegexp } from '../../shared/lib/escape-regexp'

/**
 * A routing rule for a deployment, in the shape `handleBuildComplete` hands to
 * the adapter.
 */
export interface VariantsRejectionRoute {
  source: string
  sourceRegex: string
  destination: string
  has: RouteHas[] | undefined
  missing: RouteHas[] | undefined
}

/**
 * Matches one character of a pathname as the deployment receives it: either the
 * character itself or its percent-encoded form, with either case of the
 * hexadecimal digits.
 *
 * A deployment matches a routing rule against the pathname as sent, and it
 * decodes the pathname before it looks an artifact up. A rule that names the
 * artifact namespace therefore has to match the encoded spellings too.
 */
function encodedCharacterPattern(character: string): string {
  const hex = character.charCodeAt(0).toString(16).toUpperCase()
  const digits = hex
    .split('')
    .map((digit) =>
      /[A-F]/.test(digit) ? `[${digit}${digit.toLowerCase()}]` : digit
    )
    .join('')

  return `(?:${escapeStringRegexp(character)}|%${digits})`
}

/**
 * Matches a path separator as the deployment receives it. A backslash counts,
 * because the lookup converts it into a slash, and so does an encoded slash.
 */
const SEPARATOR_PATTERN = `(?:/|\\\\|%2[fF]|%5[cC])`

/**
 * Matches the namespace segment in any spelling that decodes to it.
 */
const VARIANTS_SEGMENT_PATTERN = VARIANTS_PATH_PREFIX.split('')
  .map((character) => encodedCharacterPattern(character))
  .join('')

/**
 * The pattern of a request pathname under the artifact namespace, after any
 * base path. It admits every spelling that decodes to `/__variants/`, and it
 * consumes the rest of the pathname, because a deployment anchors a rule at
 * both ends.
 */
const VARIANTS_PREFIX_SOURCE_PATTERN = `${SEPARATOR_PATTERN}+${VARIANTS_SEGMENT_PATTERN}${SEPARATOR_PATTERN}.*$`

/**
 * The rules that reject a request naming a static variant combination itself.
 *
 * They run before the files and before every user rewrite, and after the proxy.
 * A request for an artifact path, or one carrying the query parameter that
 * routing derives from the prefix, is admitted only when the proxy marked it.
 * Otherwise the rules rewrite it to a pathname that no matcher serves, so the
 * deployment answers 404. A deployment cannot answer with a status from a
 * routing rule without also looking the pathname up, which is why the rejection
 * is a rewrite.
 *
 * The destination lies under the artifact namespace itself, so the prefix rule
 * also matches it. The rewrite it then produces names the same pathname.
 *
 * The query rules name every spelling of the parameter that a route would
 * normalize into `NEXT_VARIANTS_QUERY_PARAM`.
 */
export function buildVariantsRejectionRoutes(
  basePath: string
): VariantsRejectionRoute[] {
  const basePathPattern =
    basePath && basePath !== '/'
      ? escapeStringRegexp(path.posix.join('/', basePath))
      : ''
  const destination = path.posix.join('/', basePath, VARIANTS_NOT_ROUTED_PATH)
  const missing: RouteHas[] = [
    { type: 'header', key: NEXT_VARIANTS_PREFIX_HEADER },
  ]

  return [
    {
      source: `/${VARIANTS_PATH_PREFIX}/:path*`,
      sourceRegex: `^${basePathPattern}${VARIANTS_PREFIX_SOURCE_PATTERN}`,
      destination,
      has: undefined,
      missing,
    },
    ...VARIANTS_SELECTOR_QUERY_KEYS.map(
      (key): VariantsRejectionRoute => ({
        source: '/:path*',
        sourceRegex: '^/.*$',
        destination,
        has: [{ type: 'query', key }],
        missing,
      })
    ),
  ]
}
