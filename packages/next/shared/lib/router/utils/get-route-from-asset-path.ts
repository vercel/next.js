// Translate a pages asset path (relative from a common prefix) back into its logical route
// "asset path" being its javascript file, data file, prerendered html,...
export default function getRouteFromAssetPath(
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
