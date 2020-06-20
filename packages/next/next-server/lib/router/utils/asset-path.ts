export function getPageAssetPath(route: string): string {
  return route === '/'
    ? '/index'
    : /^\/index(\/|$)/.test(route)
    ? `/index${route}`
    : `${route}`
}
