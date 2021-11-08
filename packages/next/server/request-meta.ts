/* eslint-disable no-redeclare */
import type { ParsedUrlQuery } from 'querystring'
import type { IncomingMessage } from 'http'
import type { UrlWithParsedQuery } from 'url'

const NEXT_REQUEST_META = Symbol('NextRequestMeta')

interface NextIncomingMessage extends IncomingMessage {
  [NEXT_REQUEST_META]?: RequestMeta
}

interface RequestMeta {
  __NEXT_INIT_QUERY?: ParsedUrlQuery
  __NEXT_INIT_URL?: string
  __nextHadTrailingSlash?: boolean
  __nextIsLocaleDomain?: boolean
  __nextStrippedLocale?: boolean
  _nextDidRewrite?: boolean
  _nextHadBasePath?: boolean
  _nextRewroteUrl?: string
}

export function getRequestMeta(
  req: NextIncomingMessage,
  key?: undefined
): RequestMeta
export function getRequestMeta<K extends keyof RequestMeta>(
  req: NextIncomingMessage,
  key: K
): RequestMeta[K]
export function getRequestMeta<K extends keyof RequestMeta>(
  req: NextIncomingMessage,
  key?: K
): RequestMeta | RequestMeta[K] {
  const meta = req[NEXT_REQUEST_META] || {}
  return typeof key === 'string' ? meta[key] : meta
}

export function setRequestMeta(req: NextIncomingMessage, meta: RequestMeta) {
  req[NEXT_REQUEST_META] = meta
  return getRequestMeta(req)
}

export function addRequestMeta<K extends keyof RequestMeta>(
  request: NextIncomingMessage,
  key: K,
  value: RequestMeta[K]
) {
  const meta = getRequestMeta(request)
  meta[key] = value
  return setRequestMeta(request, meta)
}

export type NextParsedUrlQuery = ParsedUrlQuery & {
  __nextDefaultLocale?: string
  __nextFallback?: 'true'
  __nextLocale?: string
  __nextSsgPath?: string
  _nextBubbleNoFallback?: '1'
  _nextDataReq?: '1'
  amp?: '1'
}

export interface NextUrlWithParsedQuery extends UrlWithParsedQuery {
  query: NextParsedUrlQuery
}
