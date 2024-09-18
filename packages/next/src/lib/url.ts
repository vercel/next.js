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

// patch URL.canParse to be available in older browsers e.g. Safari 16
// x-ref: https://github.com/vercel/next.js/pull/70215
// x-ref: https://caniuse.com/?search=URL.canParse
if (!('canParse' in URL)) {
  ;(URL as any).canParse = (url: string, base?: string): boolean => {
    try {
      return !!new URL(url, base)
    } catch {
      return false
    }
  }
}
