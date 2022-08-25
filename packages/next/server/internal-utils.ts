import type { NextParsedUrlQuery } from './request-meta'

const INTERNAL_QUERY_NAMES = [
  '__nextFallback',
  '__nextLocale',
  '__nextDefaultLocale',
  '__nextIsNotFound',
  // RSC
  '__flight__',
  '__props__',
  // Routing
  '__flight_router_state_tree__',
] as const

export function stripInternalQueries(query: NextParsedUrlQuery) {
  for (const name of INTERNAL_QUERY_NAMES) {
    delete query[name]
  }
}

export function stripInternalSearchParams(searchParams: URLSearchParams) {
  for (const name of INTERNAL_QUERY_NAMES) {
    searchParams.delete(name)
  }

  return searchParams
}
