import type { NextParsedUrlQuery } from './request-meta'

const INTERNAL_QUERY_NAMES = [
  '__nextFallback',
  '__nextLocale',
  '__nextDefaultLocale',
  '__nextIsNotFound',
] as const

const EXTENDED_INTERNAL_QUERY_NAMES = ['__nextDataReq'] as const

export function stripInternalQueries(query: NextParsedUrlQuery) {
  for (const name of INTERNAL_QUERY_NAMES) {
    delete query[name]
  }
}

export function stripInternalSearchParams(
  searchParams: URLSearchParams,
  extended?: boolean
) {
  for (const name of INTERNAL_QUERY_NAMES) {
    searchParams.delete(name)
  }

  if (extended) {
    for (const name of EXTENDED_INTERNAL_QUERY_NAMES) {
      searchParams.delete(name)
    }
  }

  return searchParams
}
