import { BLOCKED_PAGES } from '../lib/constants'

const internalPrefixes = [
  /^\/_next\//,
  /^\/static\//,
]

export function isInternalUrl(url: string): boolean {
  for (const prefix of internalPrefixes) {
    if (prefix.test(url)) {
      return true
    }
  }

  return false
}

export function isBlockedPage(pathname: string): boolean {
  return (BLOCKED_PAGES.indexOf(pathname) !== -1)
}

export function cleanAmpPath(pathname: string): string {
  if (pathname.match(/\?amp=(y|yes|true|1)/)) {
    pathname = pathname.replace(/\?amp=(y|yes|true|1)/, '?')
  }
  if (pathname.match(/&amp=(y|yes|true|1)/)) {
    pathname = pathname.replace(/\?amp=(y|yes|true|1)/, '')
  }
  pathname = pathname.replace(/\?$/, '')
  return pathname
}
