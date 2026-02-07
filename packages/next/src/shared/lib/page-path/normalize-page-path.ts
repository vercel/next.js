import { ensureLeadingSlash } from './ensure-leading-slash'
import { isDynamicRoute } from '../router/utils'
import { NormalizeError } from '../utils'

/**
 * Takes a page and transforms it into its file counterpart ensuring that the
 * output is normalized. Note this function is not idempotent because a page
 * `/index` can be referencing `/index/index.js` and `/index/index` could be
 * referencing `/index/index/index.js`. Examples:
 *  - `/` -> `/index`
 *  - `/index/foo` -> `/index/index/foo`
 *  - `/index` -> `/index/index`
 */
export function normalizePagePath(page: string): string {
  const normalized =
    /^\/index(\/|$)/.test(page) && !isDynamicRoute(page)
      ? `/index${page}`
      : page === '/'
        ? '/index'
        : ensureLeadingSlash(page)

  if (process.env.NEXT_RUNTIME !== 'edge') {
    const { posix } = require('path') as typeof import('path')
    const resolvedPage = posix.normalize(normalized)
    if (resolvedPage !== normalized) {
      throw new NormalizeError(
        `Requested and resolved page mismatch: ${normalized} ${resolvedPage}`
      )
    }
  }

  return normalized
}
