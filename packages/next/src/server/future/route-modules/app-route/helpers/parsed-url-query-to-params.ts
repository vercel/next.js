import type { ParsedUrlQuery } from 'querystring'

/**
 * Converts the query into params.
 *
 * @param query the query to convert to params
 * @returns the params
 */
export function parsedUrlQueryToParams(
  query: ParsedUrlQuery
): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {}

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'undefined') continue
    params[key] = value
  }

  return params
}
