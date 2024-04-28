import { NEXT_RSC_UNION_QUERY } from '../client/components/app-router-headers'

export const DUMMY_ORIGIN = 'http://n'

function getUrlWithoutHost(url: string) {
  return new URL(url, DUMMY_ORIGIN)
}

export function getPathname(url: string) {
  return getUrlWithoutHost(url).pathname
}

export function isFullStringUrl(url: string) {
  return /https?:\/\//.test(url)
}

export function stripNextRscUnionQuery(relativeUrl: string): string {
  const urlInstance = new URL(relativeUrl, DUMMY_ORIGIN)
  urlInstance.searchParams.delete(NEXT_RSC_UNION_QUERY)

  return urlInstance.pathname + urlInstance.search
}
