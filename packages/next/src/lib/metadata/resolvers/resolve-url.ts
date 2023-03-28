import path from '../../../shared/lib/isomorphic/path'
import { warnOnce } from '../../../shared/lib/utils/warn-once'

function isStringOrURL(icon: any): icon is string | URL {
  return typeof icon === 'string' || icon instanceof URL
}

function resolveUrl(
  url: string | URL | null | undefined,
  metadataBase: URL | null
): URL | null {
  if (!url) return null
  if (url instanceof URL) return url

  try {
    // If we can construct a URL instance from url, ignore metadataBase
    const parsedUrl = new URL(url)
    return parsedUrl
  } catch (_) {}

  if (!metadataBase) {
    throw new Error(
      `metadata.metadataBase needs to be provided for resolving absolute URL: ${url}`
    )
  }
  if (metadataBase.origin === 'http://n') {
    metadataBase = new URL(`http://localhost:${process.env.PORT || 3000}`)
    // Development mode warning
    warnOnce(
      `"metadataBase" is not set and fallbacks to "${metadataBase.origin}", please specify it in root layout to resolve absolute urls.`
    )
  }

  // Handle relative or absolute paths
  const basePath = metadataBase.pathname || '/'
  const joinedPath = path.join(basePath, url)

  return new URL(joinedPath, metadataBase)
}

export { isStringOrURL, resolveUrl }
