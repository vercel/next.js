export function normalizedAssetPrefix(assetPrefix: string): string {
  const escapedAssetPrefix = assetPrefix.replace(/^\/+/, '')

  if (escapedAssetPrefix.startsWith('http')) {
    return escapedAssetPrefix.split('://', 2)[1]
  }

  return `${escapedAssetPrefix ? `/${escapedAssetPrefix}` : ''}`
}
