export function normalizedAssetPrefix(assetPrefix: string | undefined): string {
  const escapedAssetPrefix = assetPrefix?.replace(/^\/+/, '') || false

  // assetPrefix as a url
  if (escapedAssetPrefix && escapedAssetPrefix.startsWith('://')) {
    return escapedAssetPrefix.split('://', 2)[1]
  }

  // assetPrefix is set to `undefined` or '/'
  if (!escapedAssetPrefix) {
    return ''
  }

  // assetPrefix is a common path but escaped so let's add one leading slash
  return `/${escapedAssetPrefix}`
}
