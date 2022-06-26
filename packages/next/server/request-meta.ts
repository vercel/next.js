/* eslint-disable no-redeclare */
import type { IncomingMessage } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import type { UrlWithParsedQuery } from 'url'
import type { BaseNextRequest } from './base-http'

export const NEXT_REQUEST_META = Symbol('NextRequestMeta')

export type NextIncomingMessage = (BaseNextRequest | IncomingMessage) & {
  [NEXT_REQUEST_META]?: RequestMeta
}

export interface RequestMeta {
  __NEXT_INIT_QUERY?: ParsedUrlQuery
  __NEXT_INIT_URL?: string
  __nextHadTrailingSlash?: boolean
  __nextIsLocaleDomain?: boolean
  __nextStrippedLocale?: boolean
  _nextDidRewrite?: boolean
  _nextHadBasePath?: boolean
  _nextRewroteUrl?: string
  _protocol?: string
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

type NextQueryMetadata = {
  __nextNotFoundSrcPage?: string
  __nextDefaultLocale?: string
  __nextFallback?: 'true'
  __nextLocale?: string
  __nextSsgPath?: string
  _nextBubbleNoFallback?: '1'
  __nextDataReq?: '1'
}

export type NextParsedUrlQuery = ParsedUrlQuery &
  NextQueryMetadata & {
    amp?: '1'
  }

export interface NextUrlWithParsedQuery extends UrlWithParsedQuery {
  query: NextParsedUrlQuery
}

export function getNextInternalQuery(
  query: NextParsedUrlQuery
): NextQueryMetadata {
  const keysToInclude: (keyof NextQueryMetadata)[] = [
    '__nextDefaultLocale',
    '__nextFallback',
    '__nextLocale',
    '__nextSsgPath',
    '_nextBubbleNoFallback',
    '__nextDataReq',
  ]
  const nextInternalQuery: NextQueryMetadata = {}

  for (const key of keysToInclude) {
    if (key in query) {
      // @ts-ignore this can't be typed correctly
      nextInternalQuery[key] = query[key]
    }
  }

  return nextInternalQuery
}
