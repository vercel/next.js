export function getAssetPath(route: string) {
  // If the page is `/` we use `/index`, otherwise the returned directory root will be bundles instead of pages
  // this overwrites the asset of page `/index` so we prepend all route under `/index` with `/index`
  return route === '/'
    ? '/index'
    : /^\/index(\/|$)/.test(route)
    ? `/index${route}`
    : `${route}`
}
