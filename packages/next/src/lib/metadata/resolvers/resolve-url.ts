import path from '../../../shared/lib/isomorphic/path'
import { warnOnce } from '../../../shared/lib/utils/warn-once'

function isStringOrURL(icon: any): icon is string | URL {
  return typeof icon === 'string' || icon instanceof URL
}

function resolveUrl(url: null | undefined, metadataBase: URL | null): null
function resolveUrl(url: string | URL, metadataBase: URL | null): URL
function resolveUrl(
  url: string | URL | null | undefined,
  metadataBase: URL | null
): URL | null
function resolveUrl(
  url: string | URL | null | undefined,
  metadataBase: URL | null
): URL | null {
  if (url instanceof URL) return url
  if (!url) return null

  try {
    // If we can construct a URL instance from url, ignore metadataBase
    const parsedUrl = new URL(url)
    return parsedUrl
  } catch (_) {}

  if (!metadataBase) {
    if (process.env.NODE_ENV !== 'production') {
      metadataBase = new URL(`http://localhost:${process.env.PORT || 3000}`)
      // Development mode warning
      warnOnce(
        `metadata.metadataBase is not set and fallbacks to "${metadataBase.origin}", please specify it in root layout to resolve absolute urls.`
      )
    } else {
      throw new Error(
        `metadata.metadataBase needs to be provided for resolving absolute URL: ${url}`
      )
    }
  }

  // Handle relative or absolute paths
  const basePath = metadataBase.pathname || '/'
  const joinedPath = path.join(basePath, url)

  return new URL(joinedPath, metadataBase)
}

// Return a string url without trailing slash
const resolveStringUrl = (url: string | URL) => {
  const href = typeof url === 'string' ? url : url.toString()
  return href.endsWith('/') ? href.slice(0, -1) : href
}

export { isStringOrURL, resolveUrl, resolveStringUrl }
