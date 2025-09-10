import type { ParsedUrlQuery } from 'querystring'

import { searchParamsToUrlQuery } from './querystring'
import { parseRelativeUrl } from './parse-relative-url'

export interface ParsedUrl {
  hash: string
  hostname?: string | null
  href: string
  pathname: string
  port?: string | null
  protocol?: string | null
  query: ParsedUrlQuery
  origin?: string | null
  search: string
  slashes: boolean | undefined
}

export function parseUrl(url: string): ParsedUrl {
  if (url.startsWith('/')) {
    return parseRelativeUrl(url)
  }

  const parsedURL = new URL(url)
  return {
    hash: parsedURL.hash,
    hostname: parsedURL.hostname,
    href: parsedURL.href,
    pathname: parsedURL.pathname,
    port: parsedURL.port,
    protocol: parsedURL.protocol,
    query: searchParamsToUrlQuery(parsedURL.searchParams),
    search: parsedURL.search,
    origin: parsedURL.origin,
    slashes:
      parsedURL.href.slice(
        parsedURL.protocol.length,
        parsedURL.protocol.length + 2
      ) === '//',
  }
}
