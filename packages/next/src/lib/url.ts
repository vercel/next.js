import type { UrlWithParsedQuery } from 'url'
import { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'

const DUMMY_ORIGIN = 'http://n'

export function isFullStringUrl(url: string) {
  return /https?:\/\//.test(url)
}

export function parseUrl(url: string): URL | undefined {
  let parsed: URL | undefined = undefined
  try {
    parsed = new URL(url, DUMMY_ORIGIN)
  } catch {}
  return parsed
}

export function parseReqUrl(url: string): UrlWithParsedQuery | undefined {
  const parsedUrl: URL | undefined = parseUrl(url)

  if (!parsedUrl) {
    return
  }

  const query: Record<string, string | string[]> = {}

  for (const key of parsedUrl.searchParams.keys()) {
    const values = parsedUrl.searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }

  const legacyUrl: UrlWithParsedQuery = {
    query,
    hash: parsedUrl.hash,
    search: parsedUrl.search,
    path: parsedUrl.pathname,
    pathname: parsedUrl.pathname,
    href: `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`,
    host: '',
    hostname: '',
    auth: '',
    protocol: '',
    slashes: null,
    port: '',
  }
  return legacyUrl
}

export function stripNextRscUnionQuery(relativeUrl: string): string {
  const urlInstance = new URL(relativeUrl, DUMMY_ORIGIN)
  urlInstance.searchParams.delete(NEXT_RSC_UNION_QUERY)

  return urlInstance.pathname + urlInstance.search
}
