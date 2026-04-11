import {
  getOutputExportFallbackMetadataPath,
  getOutputExportFallbackPath,
  type OutputExportFallbackManifestEntry,
} from '../lib/output-export-dynamic-fallback'
import { RSC_CONTENT_TYPE_HEADER } from './components/app-router-headers'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'

type OutputExportFallbackManifest = {
  version: 1
  routes: OutputExportFallbackManifestEntry[]
}

const outputExportFallbackManifestCache = new Map<
  string,
  Promise<OutputExportFallbackManifest | null>
>()

function getOutputExportFallbackDataUrlCache(): Map<string, string> {
  const globalWithCache = globalThis as typeof globalThis & {
    __NEXT_OUTPUT_EXPORT_FALLBACK_DATA_URL_CACHE?: Map<string, string>
  }
  const existing = globalWithCache.__NEXT_OUTPUT_EXPORT_FALLBACK_DATA_URL_CACHE
  if (existing !== undefined) {
    return existing
  }

  const cache = new Map<string, string>()
  globalWithCache.__NEXT_OUTPUT_EXPORT_FALLBACK_DATA_URL_CACHE = cache
  return cache
}

function getOutputExportFallbackBasePathCache(): Map<string, string> {
  const globalWithCache = globalThis as typeof globalThis & {
    __NEXT_OUTPUT_EXPORT_FALLBACK_BASE_PATH_CACHE?: Map<string, string>
  }
  const existing = globalWithCache.__NEXT_OUTPUT_EXPORT_FALLBACK_BASE_PATH_CACHE
  if (existing !== undefined) {
    return existing
  }

  const cache = new Map<string, string>()
  globalWithCache.__NEXT_OUTPUT_EXPORT_FALLBACK_BASE_PATH_CACHE = cache
  return cache
}

export function getOutputExportFallbackCandidates(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean)
  const candidates: string[] = []

  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join('/')
    candidates.push(getOutputExportFallbackPath(prefix))
  }

  candidates.push(getOutputExportFallbackPath(''))

  return candidates
}

export function addOutputExportDataSuffix(url: URL): URL {
  const nextUrl = new URL(url)
  if (nextUrl.pathname.endsWith('/')) {
    nextUrl.pathname += 'index.txt'
  } else {
    nextUrl.pathname += '.txt'
  }
  return nextUrl
}

export function isOutputExportFlightContentType(contentType: string): boolean {
  return (
    contentType.startsWith(RSC_CONTENT_TYPE_HEADER) ||
    contentType.startsWith('text/plain') ||
    contentType.startsWith('application/octet-stream')
  )
}

export function clearOutputExportFallbackManifestCache(): void {
  outputExportFallbackManifestCache.clear()
  getOutputExportFallbackDataUrlCache().clear()
  getOutputExportFallbackBasePathCache().clear()
}

export function stripOutputExportDataSuffix(url: URL): URL {
  const nextUrl = new URL(url)
  if (nextUrl.pathname.endsWith('/index.txt')) {
    nextUrl.pathname = nextUrl.pathname.slice(0, -10) || '/'
  } else if (nextUrl.pathname.endsWith('.txt')) {
    nextUrl.pathname = `${nextUrl.pathname.slice(0, -4)}.html`
  }
  return nextUrl
}

function getOutputExportFallbackMetadataUrl(url: URL): URL {
  const nextUrl = new URL(url)
  nextUrl.pathname = getOutputExportFallbackMetadataPath(nextUrl.pathname)
  return nextUrl
}

function matchOutputExportFallbackManifestEntry(
  entry: OutputExportFallbackManifestEntry,
  pathname: string
): boolean {
  const matcher = getRouteMatcher(getRouteRegex(entry.route))
  return matcher(pathname) !== false
}

async function fetchOutputExportFallbackManifest(
  fallbackUrl: URL,
  init?: RequestInit
): Promise<OutputExportFallbackManifest | null> {
  const metadataUrl = getOutputExportFallbackMetadataUrl(fallbackUrl)
  const cacheKey = metadataUrl.href
  const cached = outputExportFallbackManifestCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const manifestPromise = fetch(metadataUrl, init)
    .then(async (metadataResponse) => {
      if (!metadataResponse.ok) {
        return null
      }

      const contentType = metadataResponse.headers.get('content-type') || ''
      if (
        !contentType.startsWith('application/json') &&
        !contentType.startsWith('text/json')
      ) {
        return null
      }

      return metadataResponse.json()
    })
    .catch((error) => {
      outputExportFallbackManifestCache.delete(cacheKey)
      throw error
    })

  outputExportFallbackManifestCache.set(cacheKey, manifestPromise)
  return manifestPromise
}

function getOutputExportDataCandidates(url: URL): URL[] {
  const direct = addOutputExportDataSuffix(url)

  if (url.pathname.endsWith('/')) {
    return [direct]
  }

  const trailingSlashUrl = new URL(url)
  trailingSlashUrl.pathname = `${trailingSlashUrl.pathname}/`
  const trailingSlash = addOutputExportDataSuffix(trailingSlashUrl)

  return [direct, trailingSlash]
}

function normalizeOutputExportRouteDirectory(pathname: string): string {
  if (pathname === '/') {
    return ''
  }
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

function cacheOutputExportFallbackDataUrl(
  renderedUrl: URL,
  fallbackUrl: URL,
  resolvedDataUrl: URL
) {
  const dataUrlCache = getOutputExportFallbackDataUrlCache()
  for (const candidateUrl of getOutputExportDataCandidates(renderedUrl)) {
    dataUrlCache.set(candidateUrl.href, resolvedDataUrl.href)
  }
  getOutputExportFallbackBasePathCache().set(
    normalizeOutputExportRouteDirectory(renderedUrl.pathname),
    normalizeOutputExportRouteDirectory(fallbackUrl.pathname)
  )
}

export function getCachedOutputExportFallbackDataUrl(url: URL): URL | null {
  const cached = getOutputExportFallbackDataUrlCache().get(url.href)
  return cached !== undefined ? new URL(cached) : null
}

export function getCachedOutputExportFallbackRequestUrl(url: URL): URL | null {
  const cachedDataUrl = getCachedOutputExportFallbackDataUrl(url)
  if (cachedDataUrl !== null) {
    return cachedDataUrl
  }

  const filename = url.pathname.slice(url.pathname.lastIndexOf('/') + 1)
  if (!filename.startsWith('__next.')) {
    return null
  }

  const routeDirectory = normalizeOutputExportRouteDirectory(
    url.pathname.slice(0, url.pathname.lastIndexOf('/')) || '/'
  )
  const fallbackBasePath =
    getOutputExportFallbackBasePathCache().get(routeDirectory)
  if (fallbackBasePath === undefined) {
    return null
  }

  const nextUrl = new URL(url)
  nextUrl.pathname = `${fallbackBasePath}/${filename}`
  return nextUrl
}

async function fetchOutputExportDataResult(
  renderedUrl: URL,
  init?: RequestInit
): Promise<{ response: Response; dataUrl: URL } | null> {
  for (const dataUrl of getOutputExportDataCandidates(renderedUrl)) {
    const response = await fetch(dataUrl, init)
    const contentType = response.headers.get('content-type') || ''
    if (
      response.ok &&
      response.body &&
      isOutputExportFlightContentType(contentType)
    ) {
      return { response, dataUrl }
    }
  }

  return null
}

export async function fetchOutputExportDataResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<Response | null> {
  const result = await fetchOutputExportDataResult(renderedUrl, init)
  return result?.response ?? null
}

export async function fetchOutputExportFallbackResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<{ response: Response; renderedUrl: URL; fallbackUrl: URL } | null> {
  for (const candidate of getOutputExportFallbackCandidates(
    renderedUrl.pathname
  )) {
    const candidateUrl = new URL(renderedUrl)
    candidateUrl.pathname = candidate

    const fallbackManifest = await fetchOutputExportFallbackManifest(
      candidateUrl,
      init
    )
    if (fallbackManifest !== null) {
      for (const entry of fallbackManifest.routes) {
        if (
          !matchOutputExportFallbackManifestEntry(entry, renderedUrl.pathname)
        ) {
          continue
        }

        const branchFallbackUrl = new URL(renderedUrl)
        branchFallbackUrl.pathname = entry.fallbackPath

        const result = await fetchOutputExportDataResult(
          branchFallbackUrl,
          init
        )
        if (result) {
          cacheOutputExportFallbackDataUrl(
            renderedUrl,
            branchFallbackUrl,
            result.dataUrl
          )
          return {
            response: result.response,
            renderedUrl,
            fallbackUrl: branchFallbackUrl,
          }
        }
      }
    }

    const result = await fetchOutputExportDataResult(candidateUrl, init)
    if (result) {
      cacheOutputExportFallbackDataUrl(
        renderedUrl,
        candidateUrl,
        result.dataUrl
      )
      return {
        response: result.response,
        renderedUrl,
        fallbackUrl: candidateUrl,
      }
    }
  }

  return null
}
