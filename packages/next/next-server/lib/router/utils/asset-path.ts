// These functions translate between a pages asset path (relative froma  common prefix)
// and its logical route. "asset path" being its javascript file, data file, prerendered html,...

export function getAssetPathFromRoute(route: string, ext: string = ''): string {
  const path =
    route === '/'
      ? '/index'
      : /^\/index(\/|$)/.test(route)
      ? `/index${route}`
      : `${route}`
  return path + ext
}

export function getRouteFromAssetPath(
  assetPath: string,
  ext: string = ''
): string {
  assetPath = assetPath.replace(/\\/g, '/')
  assetPath =
    ext && assetPath.endsWith(ext) ? assetPath.slice(0, -ext.length) : assetPath
  if (assetPath.startsWith('/index/')) {
    assetPath = assetPath.slice(6)
  } else if (assetPath === '/index') {
    assetPath = '/'
  }
  return assetPath
}
