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
  // Resolve url with pathname that always starts with `/`
  url = resolveRelativeUrl(url, pathname)

  // Convert string url or URL instance to absolute url string,
  // if there's case needs to be resolved with metadataBase
  let resolvedUrl = ''
  const result = metadataBase ? resolveUrl(url, metadataBase) : url
  if (typeof result === 'string') {
    resolvedUrl = result
  } else {
    resolvedUrl = result.pathname === '/' ? result.origin : result.href
  }

  // Add trailing slash if it's enabled for urls matches the condition
  // - Not external, same origin with metadataBase
  // - Doesn't have query
  if (trailingSlash && !resolvedUrl.endsWith('/')) {
    let isRelative = resolvedUrl.startsWith('/')
    let isExternal = false
    let hasQuery = resolvedUrl.includes('?')
    if (!isRelative) {
      try {
        const parsedUrl = new URL(resolvedUrl)
        isExternal =
          metadataBase != null && parsedUrl.origin !== metadataBase.origin
      } catch {
        // If it's not a valid URL, treat it as external
        isExternal = true
      }
      if (!isExternal && !hasQuery) return `${resolvedUrl}/`
    }
  }

  return resolvedUrl
}

export {
  isStringOrURL,
  resolveUrl,
  resolveRelativeUrl,
  resolveAbsoluteUrlWithPathname,
}
