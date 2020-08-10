export { normalizePathSep, denormalizePagePath } from './denormalize-page-path'

export function normalizePagePath(page: string): string {
  let posix

  // prevents path from being polyfilled in the browser since
  // this method isn't used client side
  if (typeof window === 'undefined') {
    posix = require('path').posix
  }

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
