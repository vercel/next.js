import type { Page, Route } from '../../route-types'
import { parsePath } from './parse-path'

/**
 * Similarly to `addPathPrefix`, this function adds a suffix at the end on the
 * provided path. It also works only for paths ensuring the argument starts
 * with a slash.
 */
export function addPathSuffix(path: Page, suffix?: string): Page
export function addPathSuffix(path: Route, suffix?: string): Route
export function addPathSuffix(path: string, suffix?: string): string
export function addPathSuffix(path: string, suffix?: string) {
  if (!path.startsWith('/') || !suffix) {
    return path
  }

  const { pathname, query, hash } = parsePath(path)
  return `${pathname}${suffix}${query}${hash}`
}
