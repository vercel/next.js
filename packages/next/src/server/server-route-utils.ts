import type { ParsedUrlQuery } from 'querystring'

import { stringify as stringifyQs } from 'querystring'

// since initial query values are decoded by querystring.parse
// we need to re-encode them here. This also encodes values added
// by rewrites/redirects in middleware to prevent query string corruption.
export const stringifyQuery = (_req: unknown, query: ParsedUrlQuery) => {
  return stringifyQs(query)
}
