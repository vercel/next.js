export function normalizedAssetPrefix(assetPrefix: string | undefined): string {
  // remove all leading slashes and trailing slashes
  const escapedAssetPrefix = assetPrefix?.replace(/^\/+|\/+$/g, '') || false

  // if an assetPrefix was '/', we return empty string
  // because it could be an unnecessary trailing slash
  if (!escapedAssetPrefix) {
    return ''
  }

  if (URL.canParse(escapedAssetPrefix)) {
    const url = new URL(escapedAssetPrefix).toString()
    return url.endsWith('/') ? url.slice(0, -1) : url
  }

  // assuming assetPrefix here is a pathname-style,
  // restore the leading slash
  return `/${escapedAssetPrefix}`
}
