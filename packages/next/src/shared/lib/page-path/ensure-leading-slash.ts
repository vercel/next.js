import type { Page, Route } from '../route-types'

/**
 * For a given page path, this function ensures that there is a leading slash.
 * If there is not a leading slash, one is added, otherwise it is noop.
 */
export function ensureLeadingSlash(path: Page): Page
export function ensureLeadingSlash(path: Route): Route
export function ensureLeadingSlash(path: string): string
export function ensureLeadingSlash(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}
