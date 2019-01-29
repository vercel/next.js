import { posix } from 'path'
export function normalizePagePath(page: string): string {
  // If the page is `/` we need to append `/index`, otherwise the returned directory root will be bundles instead of pages
  if (page === '/') {
    page = '/index'
  }
  // Resolve on anything that doesn't start with `/`
  if (page[0] !== '/') {
    page = `/${page}`
  }
  // Throw when using ../ etc in the pathname
  const resolvedPage = posix.normalize(page)
  if (page !== resolvedPage) {
    throw new Error('Requested and resolved page mismatch')
  }
  return page
}
