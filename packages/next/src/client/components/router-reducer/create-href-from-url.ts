export function createHrefFromUrl(
  url: Pick<URL, 'pathname' | 'search' | 'hash'>,
  includeHash: boolean = true
): string {
  return url.pathname + url.search + (includeHash ? url.hash : '')
}
