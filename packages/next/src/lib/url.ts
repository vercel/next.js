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

export function parseReqUrl(url: string): UrlWithParsedQuery {
  const parsedUrl = parseUrl(url)

  // Return fallback for invalid URLs (matches url.parse behavior which never returns undefined)
  if (!parsedUrl) {
    return {
      query: {},
      hash: '',
      search: '',
      path: url,
      pathname: url,
      href: url,
      host: '',
      hostname: '',
      protocol: '',
      port: '',
      auth: '',
      slashes: null,
    }
  }

  const query: Record<string, string | string[]> = {}
  for (const key of parsedUrl.searchParams.keys()) {
    const values = parsedUrl.searchParams.getAll(key)
    query[key] = values.length > 1 ? values : values[0]
  }

  const shared = {
    query,
    hash: parsedUrl.hash,
    search: parsedUrl.search,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    pathname: parsedUrl.pathname,
    port: parsedUrl.port || '',
    auth: '',
  }

  if (!isFullStringUrl(url)) {
    return {
      ...shared,
      href: `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`,
      host: '',
      hostname: '',
      protocol: '',
      slashes: null,
    }
  }

  return {
    ...shared,
    href: parsedUrl.href,
    host: parsedUrl.host,
    hostname: parsedUrl.hostname,
    protocol: parsedUrl.protocol,
    slashes: true,
  }
}

export function stripNextRscUnionQuery(relativeUrl: string): string {
  const urlInstance = new URL(relativeUrl, DUMMY_ORIGIN)
  urlInstance.searchParams.delete(NEXT_RSC_UNION_QUERY)

  return urlInstance.pathname + urlInstance.search
}
