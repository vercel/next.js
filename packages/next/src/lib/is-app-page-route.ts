import type { Page } from '../shared/lib/route-types'

export function isAppPageRoute(route: Page): boolean {
  return route.endsWith('/page')
}
