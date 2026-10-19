import type { Page } from '../route-types'

/**
 * For a given page path, this function ensures that there is no backslash
 * escaping slashes in the path. Example:
 *  - `foo\/bar\/baz` -> `foo/bar/baz`
 */
// Build's module-ID separator normalization retains the Page namespace.
// Untouched callers keep their legacy string input/output contract.
export function normalizePathSep(path: Page): Page
export function normalizePathSep(path: string): string
export function normalizePathSep(path: string): string {
  return path.replace(/\\/g, '/')
}
