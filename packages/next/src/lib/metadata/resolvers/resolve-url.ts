import path from '../../../shared/lib/isomorphic/path'
import type { MetadataContext } from '../types/resolvers'

function isStringOrURL(icon: any): icon is string | URL {
  return typeof icon === 'string' || icon instanceof URL
}

function createLocalMetadataBase() {
  return new URL(`http://localhost:${process.env.PORT || 3000}`)
}

// For deployment url for metadata routes, prefer to use the deployment url if possible
// as these routes are unique to the deployments url.
export function getSocialImageFallbackMetadataBase(metadataBase: URL | null): {
  fallbackMetadataBase: URL
  isMetadataBaseMissing: boolean
} {
  const isMetadataBaseMissing = !metadataBase
  const defaultMetadataBase = createLocalMetadataBase()
  const deploymentUrl =
    process.env.VERCEL_URL && new URL(`https://${process.env.VERCEL_URL}`)

  let fallbackMetadataBase
  if (process.env.NODE_ENV === 'development') {
    fallbackMetadataBase = defaultMetadataBase
  } else {
    fallbackMetadataBase =
      process.env.NODE_ENV === 'production' &&
      deploymentUrl &&
      process.env.VERCEL_ENV === 'preview'
        ? deploymentUrl
        : metadataBase || deploymentUrl || defaultMetadataBase
  }

  return {
    fallbackMetadataBase,
    isMetadataBaseMissing,
  }
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
  } catch {}

  if (!metadataBase) {
    metadataBase = createLocalMetadataBase()
  }

  // Handle relative or absolute paths
  const basePath = metadataBase.pathname || ''
  const joinedPath = path.posix.join(basePath, url)

  return new URL(joinedPath, metadataBase)
}

// Resolve with `pathname` if `url` is a relative path.
function resolveRelativeUrl(url: string | URL, pathname: string): string | URL {
  if (typeof url === 'string' && url.startsWith('./')) {
    return path.posix.resolve(pathname, url)
  }
  return url
}

// Resolve `pathname` if `url` is a relative path the compose with `metadataBase`.
function resolveAbsoluteUrlWithPathname(
  url: string | URL,
  metadataBase: URL | null,
  { trailingSlash, pathname }: MetadataContext
): string {
  url = resolveRelativeUrl(url, pathname)

  // Get canonicalUrl without trailing slash
  let canonicalUrl = ''
  const result = metadataBase ? resolveUrl(url, metadataBase) : url
  if (typeof result === 'string') {
    canonicalUrl = result
  } else {
    canonicalUrl = result.pathname === '/' ? result.origin : result.href
  }

  // Add trailing slash if it's enabled
  return trailingSlash && !canonicalUrl.endsWith('/')
    ? `${canonicalUrl}/`
    : canonicalUrl
}

export {
  isStringOrURL,
  resolveUrl,
  resolveRelativeUrl,
  resolveAbsoluteUrlWithPathname,
}
