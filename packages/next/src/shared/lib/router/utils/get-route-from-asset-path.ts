// Translate a pages asset path (relative from a common prefix) back into its logical route

import { isDynamicRoute } from './is-dynamic'

// "asset path" being its javascript file, data file, prerendered html,...
export default function getRouteFromAssetPath(
  assetPath: string,
  ext: string = ''
): string {
  assetPath = assetPath.replace(/\\/g, '/')

  // If the assetPath has the provided extension, remove it.
  if (ext && assetPath.endsWith(ext)) {
    assetPath = assetPath.slice(0, -ext.length)
  }

  // If the assetPath starts with `/index/` and isn't a dynamic route, remove
  // the `/index` prefix.
  if (assetPath.startsWith('/index/') && !isDynamicRoute(assetPath)) {
    return assetPath.slice(6)
  }
  // If the assetPath is `/index`, return `/`.
  else if (assetPath === '/index') {
    return '/'
  }

  return assetPath
}
