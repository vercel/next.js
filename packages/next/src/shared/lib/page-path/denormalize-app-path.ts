import type { Page } from '../route-types'

export function denormalizeAppPagePath(page: Page): Page {
  // `/` is normalized to `/index`
  if (page === '/index') {
    return '/' as Page
  }

  return page
}
