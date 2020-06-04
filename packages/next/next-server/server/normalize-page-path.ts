import { posix } from 'path'

export function normalizePathSep(path: string): string {
  return path.replace(/\\/g, '/')
}

export function normalizePagePath(page: string): string {
  // If the page is `/` we need to append `/index`, otherwise the returned directory root will be bundles instead of pages
  if (page === '/') {
    page = '/index'
  } else if (/^\/index(\/|$)/.test(page)) {
    page = `/index${page}`
  }
  // Resolve on anything that doesn't start with `/`
  if (!page.startsWith('/')) {
    page = `/${page}`
  }
  // Throw when using ../ etc in the pathname
  const resolvedPage = posix.normalize(page)
  if (page !== resolvedPage) {
    throw new Error(
      `Requested and resolved page mismatch: ${page} ${resolvedPage}`
    )
  }
  return page
}

export function denormalizePagePath(page: string) {
  page = normalizePathSep(page)
  if (page.startsWith('/index/')) {
    page = page.slice(6)
  } else if (page === '/index') {
    page = '/'
  }
  return page
}
