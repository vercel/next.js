import { BLOCKED_PAGES } from 'next-server/constants'

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
  return (pathname || '')
    .replace(/\.amp$/, '')
    .replace(/\index$/, '')
}

export function isAmpPath(pathname: string): boolean {
  return (pathname || '').endsWith('.amp')
}

export function isAmpFile(pathname: string): boolean {
  if (isAmpPath(pathname)) return true
  pathname = pathname || ''
  const parts = pathname.split('.')
  parts.pop() // remove extension
  return isAmpPath(parts.join('.'))
}
