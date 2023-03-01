export function createHrefFromUrl(
  url: Pick<URL, 'pathname' | 'search' | 'hash'>
): string {
  return url.pathname + url.search + url.hash
}
