/**
 * For a given page path, this function ensures that there is a leading slash.
 * If there is not a leading slash, one is added, otherwise it is noop.
 */
export function ensureLeadingSlash(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}
