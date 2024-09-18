import { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'

const DUMMY_ORIGIN = 'http://n'

export function isFullStringUrl(url: string) {
  return /https?:\/\//.test(url)
}

export function parseUrl(url: string): URL | undefined {
  let parsed = undefined
  try {
    parsed = new URL(url, DUMMY_ORIGIN)
  } catch {}
  return parsed
}

export function stripNextRscUnionQuery(relativeUrl: string): string {
  const urlInstance = new URL(relativeUrl, DUMMY_ORIGIN)
  urlInstance.searchParams.delete(NEXT_RSC_UNION_QUERY)

  return urlInstance.pathname + urlInstance.search
}

export function canParseUrl(url: string): boolean {
  if (typeof URL.canParse === 'function') {
    return URL.canParse(url)
  }
  try {
    new URL(url)
    return true
  } catch {}

  return false
}
