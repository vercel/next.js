import type { NextParsedUrlQuery } from './request-meta'

import { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'

const INTERNAL_QUERY_NAMES = [NEXT_RSC_UNION_QUERY] as const

export function stripInternalQueries(query: NextParsedUrlQuery) {
  for (const name of INTERNAL_QUERY_NAMES) {
    delete query[name]
  }
}

export function stripInternalSearchParams<T extends string | URL>(url: T): T {
  const isStringUrl = typeof url === 'string'
  const instance = isStringUrl ? new URL(url) : (url as URL)

  instance.searchParams.delete(NEXT_RSC_UNION_QUERY)

  return (isStringUrl ? instance.toString() : instance) as T
}
