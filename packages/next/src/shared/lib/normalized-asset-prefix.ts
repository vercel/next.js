export function normalizedAssetPrefix(assetPrefix: string | undefined): string {
  const escapedAssetPrefix = assetPrefix?.replace(/^\/+/, '') || false

  if (escapedAssetPrefix && escapedAssetPrefix.startsWith('http')) {
    // remove protocol for socket url
    // https://example.com/path/to/asset -> example.com/path/to/asset
    return escapedAssetPrefix.split('://', 2)[1]
  }

  // assetPrefix is set to `undefined` or '/'
  if (!escapedAssetPrefix) {
    return ''
  }

  // assetPrefix is a common path but escaped so let's add one leading slash
  return `/${escapedAssetPrefix}`
}
