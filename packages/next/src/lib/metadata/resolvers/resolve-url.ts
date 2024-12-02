import path from '../../../shared/lib/isomorphic/path'
import type { MetadataContext } from '../types/resolvers'

function isStringOrURL(icon: any): icon is string | URL {
  return typeof icon === 'string' || icon instanceof URL
}

function createLocalMetadataBase() {
  return new URL(`http://localhost:${process.env.PORT || 3000}`)
}

function getPreviewDeploymentUrl(): URL | undefined {
  const origin = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
  return origin ? new URL(`https://${origin}`) : undefined
}

function getProductionDeploymentUrl(): URL | undefined {
  const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return origin ? new URL(`https://${origin}`) : undefined
}

/**
 * Given an optional user-provided metadataBase, this determines what the metadataBase should
 * fallback to. Specifically:
 * - In dev, it should always be localhost
 * - In Vercel preview builds, it should be the preview build ID
 * - In start, it should be the user-provided metadataBase value. Otherwise,
 * it'll fall back to the Vercel production deployment, and localhost as a last resort.
 */
export function getSocialImageMetadataBaseFallback(
  metadataBase: URL | null
): URL {
  const defaultMetadataBase = createLocalMetadataBase()
  const previewDeploymentUrl = getPreviewDeploymentUrl()
  const productionDeploymentUrl = getProductionDeploymentUrl()

  let fallbackMetadataBase
  if (process.env.NODE_ENV === 'development') {
    fallbackMetadataBase = defaultMetadataBase
  } else {
    fallbackMetadataBase =
      process.env.NODE_ENV === 'production' &&
      previewDeploymentUrl &&
      process.env.VERCEL_ENV === 'preview'
        ? previewDeploymentUrl
        : metadataBase || productionDeploymentUrl || defaultMetadataBase
  }

  return fallbackMetadataBase
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

// The regex is matching logic from packages/next/src/lib/load-custom-routes.ts
const FILE_REGEX =
  /^(?:\/((?!\.well-known(?:\/.*)?)(?:[^/]+\/)*[^/]+\.\w+))(\/?|$)/i
function isFilePattern(pathname: string): boolean {
  return FILE_REGEX.test(pathname)
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
    let hasQuery = resolvedUrl.includes('?')
    let isExternal = false
    let isFileUrl = false

    if (!isRelative) {
      try {
        const parsedUrl = new URL(resolvedUrl)
        isExternal =
          metadataBase != null && parsedUrl.origin !== metadataBase.origin
        isFileUrl = isFilePattern(parsedUrl.pathname)
      } catch {
        // If it's not a valid URL, treat it as external
        isExternal = true
      }
      if (
        // Do not apply trailing slash for file like urls, aligning with the behavior with `trailingSlash`
        !isFileUrl &&
        !isExternal &&
        !hasQuery
      )
        return `${resolvedUrl}/`
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
