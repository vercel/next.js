import { BLOCKED_PAGES } from 'next-server/constants'

const internalPrefixes = [
  /^\/_next\//,
  /^\/static\//
]

export function isInternalUrl (url) {
  for (const prefix of internalPrefixes) {
    if (prefix.test(url)) {
      return true
    }
  }

  return false
}

export function isBlockedPage (pathname) {
  return (BLOCKED_PAGES.indexOf(pathname) !== -1)
}
