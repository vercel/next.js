import type { Page } from '../route-types'
import { isDynamicRoute } from '../router/utils'
import { normalizePathSep } from './normalize-path-sep'

/**
 * Performs the opposite transformation of `normalizePagePath`. Note that
 * this function is not idempotent either in cases where there are multiple
 * leading `/index` for the page. Examples:
 *  - `/index` -> `/`
 *  - `/index/foo` -> `/foo`
 *  - `/index/index` -> `/index`
 */
export function denormalizePagePath(page: Page): Page {
  let _page = normalizePathSep(page)
  return (
    _page.startsWith('/index/') && !isDynamicRoute(_page)
      ? _page.slice(6)
      : _page !== '/index'
        ? _page
        : '/'
  ) as Page
}
