export function getPageAssetPath(route: string, ext: string = ''): string {
  const path =
    route === '/'
      ? '/index'
      : /^\/index(\/|$)/.test(route)
      ? `/index${route}`
      : `${route}`
  return path + ext
}

export function getAssetPagePath(assetPath: string, ext: string = ''): string {
  assetPath =
    ext && assetPath.endsWith(ext) ? assetPath.slice(0, -ext.length) : assetPath
  if (assetPath.startsWith('/index/')) {
    assetPath = assetPath.slice(6)
  } else if (assetPath === '/index') {
    assetPath = '/'
  }
  return assetPath
}
