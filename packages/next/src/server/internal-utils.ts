import type { IncomingHttpHeaders } from 'http'
import type { NextParsedUrlQuery } from './request-meta'

import { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'

const INTERNAL_QUERY_NAMES = [
  '__nextFallback',
  '__nextLocale',
  '__nextInferredLocaleFromDefault',
  '__nextDefaultLocale',
  '__nextIsNotFound',
  NEXT_RSC_UNION_QUERY,
] as const

const EDGE_EXTENDED_INTERNAL_QUERY_NAMES = ['__nextDataReq'] as const

export function stripInternalQueries(query: NextParsedUrlQuery) {
  for (const name of INTERNAL_QUERY_NAMES) {
    delete query[name]
  }
}

export function stripInternalSearchParams<T extends string | URL>(
  url: T,
  isEdge: boolean
): T {
  const isStringUrl = typeof url === 'string'
  const instance = isStringUrl ? new URL(url) : (url as URL)
  for (const name of INTERNAL_QUERY_NAMES) {
    instance.searchParams.delete(name)
  }

  if (isEdge) {
    for (const name of EDGE_EXTENDED_INTERNAL_QUERY_NAMES) {
      instance.searchParams.delete(name)
    }
  }

  return (isStringUrl ? instance.toString() : instance) as T
}

/**
 * Headers that are set by the Next.js server and should be stripped from the
 * request headers going to the user's application.
 */
const INTERNAL_HEADERS = [
  'x-invoke-path',
  'x-invoke-status',
  'x-invoke-error',
  'x-invoke-query',
  'x-invoke-output',
  'x-middleware-invoke',
] as const

/**
 * Strip internal headers from the request headers.
 *
 * @param headers the headers to strip of internal headers
 */
export function stripInternalHeaders(headers: IncomingHttpHeaders) {
  for (const key of INTERNAL_HEADERS) {
    delete headers[key]
  }
}
