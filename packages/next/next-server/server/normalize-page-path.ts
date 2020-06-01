import { posix } from 'path'

// resolve paths to a unique canonicalized form
export function canonicalizePagePath(page: string): string {
  // Resolve on anything that doesn't start with `/`
  if (!page.startsWith('/')) {
    page = `/${page}`
  }
  // remove trailing slash
  page = page.replace(/(?!^)\/$/, '')
  // Throw when using ../ etc in the pathname
  const resolvedPage = posix.normalize(page)
  if (page !== resolvedPage) {
    throw new Error(
      `Requested and resolved page mismatch: ${page} ${resolvedPage}`
    )
  }
  return page
}

// resolve paths to a unique path that always has at least one segment
export function normalizePagePath(page: string): string {
  page = canonicalizePagePath(page)
  // If the page is `/` we need to append `/index`, otherwise the returned directory root will be bundles instead of pages
  if (page === '/') {
    page = '/index'
  }
  return page
}
