import path from '../../../shared/lib/isomorphic/path'

function isStringOrURL(icon: any): icon is string | URL {
  return typeof icon === 'string' || icon instanceof URL
}

function createLocalMetadataBase() {
  return new URL(`http://localhost:${process.env.PORT || 3000}`)
}

// For deployment url for metadata routes, prefer to use the deployment url if possible
// as these routes are unique to the deployments url.
export function getFallbackMetadataBaseIfPresent(
  metadataBase: URL | null
): URL | null {
  const defaultMetadataBase = createLocalMetadataBase()
  return process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_URL &&
    process.env.VERCEL_ENV === 'preview'
    ? new URL(`https://${process.env.VERCEL_URL}`)
    : process.env.NODE_ENV === 'development'
    ? defaultMetadataBase
    : metadataBase || defaultMetadataBase
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
    metadataBase = createLocalMetadataBase()
  }

  // Handle relative or absolute paths
  const basePath = metadataBase.pathname || ''
  const joinedPath = path.join(basePath, url)

  return new URL(joinedPath, metadataBase)
}

export { isStringOrURL, resolveUrl }
