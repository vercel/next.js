import { BLOCKED_PAGES } from 'next-server/constants'

const internalPrefixes = [
  /^\/_next\//,
  /^\/static\//
]

export function isInternalUrl (url: string): boolean {
  for (const prefix of internalPrefixes) {
    if (prefix.test(url)) {
      return true
    }
  }

  return false
}

export function isBlockedPage (pathname: string): boolean {
  return (BLOCKED_PAGES.indexOf(pathname) !== -1)
}
