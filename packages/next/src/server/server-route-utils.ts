import type { BaseNextRequest } from './base-http'
import type { ParsedUrlQuery } from 'querystring'

import { getRequestMeta } from './request-meta'
import { stringify as stringifyQs } from 'querystring'

// since initial query values are decoded by querystring.parse
// we need to re-encode them here but still allow passing through
// values from rewrites/redirects
export const stringifyQuery = (req: BaseNextRequest, query: ParsedUrlQuery) => {
  const initialQuery = getRequestMeta(req, 'initQuery') || {}
  const initialQueryValues = Object.values(initialQuery)

  return stringifyQs(query, undefined, undefined, {
    encodeURIComponent(value) {
      if (
        value in initialQuery ||
        initialQueryValues.some((initialQueryVal) => {
          // `value` always refers to a query value, even if it's nested in an array
          return Array.isArray(initialQueryVal)
            ? initialQueryVal.includes(value)
            : initialQueryVal === value
        })
      ) {
        // Encode keys and values from initial query
        return encodeURIComponent(value)
      }

      return value
    },
  })
}
