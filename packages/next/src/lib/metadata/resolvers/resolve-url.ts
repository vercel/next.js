import path from '../../../shared/lib/isomorphic/path'
import * as Log from '../../../build/output/log'

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
    throw new Error(
      `metadata.metadataBase needs to be set for resolving url "${url}". See https://beta.nextjs.org/docs/api-reference/metadata#metadatabase\n`
    )
  }

  if (metadataBase.origin === 'http://n') {
    metadataBase = new URL(`http://localhost:${process.env.PORT || 3000}`)
    // Development mode warning, add new line prefix for worker output
    console.log()
    Log.warn(
      `metadata.metadataBase is not set for resolving url "${url}", fallbacks to "${metadataBase.origin}". See https://beta.nextjs.org/docs/api-reference/metadata#metadatabase`
    )
  }

  // Handle relative or absolute paths
  const basePath = metadataBase.pathname || ''
  const joinedPath = path.join(basePath, url)

  return new URL(joinedPath, metadataBase)
}

// Return a string url without trailing slash
const resolveStringUrl = (url: string | URL) => {
  const href = typeof url === 'string' ? url : url.toString()
  return href.endsWith('/') ? href.slice(0, -1) : href
}

export { isStringOrURL, resolveUrl, resolveStringUrl }
