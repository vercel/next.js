import { posix } from '../shared/lib/isomorphic/path'
import { isDynamicRoute } from '../shared/lib/router/utils'
import { NormalizeError } from '../shared/lib/utils'

export { normalizePathSep, denormalizePagePath } from './denormalize-page-path'

export function normalizePagePath(page: string): string {
  // If the page is `/` we need to append `/index`, otherwise the returned directory root will be bundles instead of pages
  if (page === '/') {
    page = '/index'
  } else if (/^\/index(\/|$)/.test(page) && !isDynamicRoute(page)) {
    page = `/index${page}`
  }
  // Resolve on anything that doesn't start with `/`
  if (!page.startsWith('/')) {
    page = `/${page}`
  }
  // Throw when using ../ etc in the pathname
  const resolvedPage = posix.normalize(page)
  if (page !== resolvedPage) {
    throw new NormalizeError(
      `Requested and resolved page mismatch: ${page} ${resolvedPage}`
    )
  }
  return page
}
