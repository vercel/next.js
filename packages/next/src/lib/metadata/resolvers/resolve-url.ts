import path from '../../../shared/lib/isomorphic/path'
import type { ResolvedMetadata } from '../types/metadata-interface'

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

  if (!metadataBase)
    throw new Error(
      `metadata.metadataBase needs to be provided for resolving absolute URLs: ${url}`
    )

  // Handle relative or absolute paths
  const basePath = metadataBase.pathname || '/'
  const joinedPath = path.join(basePath, url)

  return new URL(joinedPath, metadataBase)
}

function resolveUrlValuesOfObject(
  obj: Record<string, string | URL | null> | null | undefined,
  metadataBase: ResolvedMetadata['metadataBase']
): null | Record<string, string | URL | null> {
  if (!obj) return null
  const result: Record<string, URL | string | null> = {}
  for (const [key, value] of Object.entries(obj)) {
    result[key] = metadataBase ? resolveUrl(value, metadataBase) : value
  }
  return result
}

export { isStringOrURL, resolveUrl, resolveUrlValuesOfObject }
