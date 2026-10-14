import type { Route } from './route-types'

// Encoding each URL segment preserves the pathname representation. Filesystem
// callers still pass/receive ordinary strings rather than acquiring a brand.
export function encodeURIPath(file: Route): Route
export function encodeURIPath(file: string): string
export function encodeURIPath(file: string): string {
  return file
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/')
}
