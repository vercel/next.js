import {
  getOutputExportFallbackMetadataPath,
  getOutputExportFallbackPath,
  type OutputExportFallbackManifestEntry,
} from '../lib/output-export-dynamic-fallback'
import { addPathPrefix } from '../shared/lib/router/utils/add-path-prefix'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import { RSC_CONTENT_TYPE_HEADER } from './components/app-router-headers'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'

type OutputExportFallbackManifest = {
  version: 1
  routes: OutputExportFallbackManifestEntry[]
}

type OutputExportFallbackCacheStore = {
  manifests: Map<string, Promise<OutputExportFallbackManifest | null>>
  dataResponses: Map<string, Promise<OutputExportCachedResponse | null>>
  dataUrls: Map<string, string>
  basePaths: Map<string, string>
}

type OutputExportCachedResponse = {
  body: ArrayBuffer
  headers: Array<[string, string]>
  status: number
  statusText: string
}

function getOutputExportCandidatePrefixes(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean)
  const candidates: string[] = []

  for (let i = segments.length; i >= 1; i--) {
    candidates.push(segments.slice(0, i).join('/'))
  }

  candidates.push('')

  return candidates
}

function getOutputExportFallbackCacheStore(): OutputExportFallbackCacheStore {
  const globalWithCache = globalThis as typeof globalThis & {
    __NEXT_OUTPUT_EXPORT_FALLBACK_CACHE_STORE?: OutputExportFallbackCacheStore
  }
  const existing = globalWithCache.__NEXT_OUTPUT_EXPORT_FALLBACK_CACHE_STORE
  if (existing !== undefined) {
    return existing
  }

  const cacheStore = {
    manifests: new Map<string, Promise<OutputExportFallbackManifest | null>>(),
    dataResponses: new Map<
      string,
      Promise<OutputExportCachedResponse | null>
    >(),
    dataUrls: new Map<string, string>(),
    basePaths: new Map<string, string>(),
  }
  globalWithCache.__NEXT_OUTPUT_EXPORT_FALLBACK_CACHE_STORE = cacheStore
  return cacheStore
}

export function getOutputExportFallbackCandidates(pathname: string): string[] {
  return getOutputExportCandidatePrefixes(pathname).map((prefix) =>
    getOutputExportFallbackPath(prefix)
  )
}

function getOutputExportNotFoundPath(prefix: string): string {
  return prefix.length > 0 ? `/${prefix}/_not-found` : '/_not-found'
}

export function getOutputExportNotFoundCandidates(pathname: string): string[] {
  return getOutputExportCandidatePrefixes(pathname).map((prefix) =>
    getOutputExportNotFoundPath(prefix)
  )
}

export function getConfiguredOutputExportNotFoundCandidate(
  pathname: string
): string {
  const configuredPath = normalizeOutputExportRouteDirectory(
    normalizePathTrailingSlash(
      addPathPrefix('/_not-found', process.env.__NEXT_ROUTER_BASEPATH || '')
    )
  )

  return (
    getOutputExportNotFoundCandidates(pathname).find(
      (candidate) =>
        normalizeOutputExportRouteDirectory(candidate) === configuredPath
    ) ?? getOutputExportNotFoundPath('')
  )
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
  const cacheStore = getOutputExportFallbackCacheStore()
  cacheStore.manifests.clear()
  cacheStore.dataResponses.clear()
  cacheStore.dataUrls.clear()
  cacheStore.basePaths.clear()
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
  const basePath = process.env.__NEXT_ROUTER_BASEPATH || ''
  const matcher = getRouteMatcher(getRouteRegex(entry.route))
  return matcher(removePathPrefix(pathname, basePath)) !== false
}

async function fetchOutputExportFallbackManifest(
  fallbackUrl: URL,
  init?: RequestInit
): Promise<OutputExportFallbackManifest | null> {
  const metadataUrl = getOutputExportFallbackMetadataUrl(fallbackUrl)
  const cacheKey = metadataUrl.href
  const manifestCache = getOutputExportFallbackCacheStore().manifests
  const cached = manifestCache.get(cacheKey)
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
      manifestCache.delete(cacheKey)
      throw error
    })

  manifestCache.set(cacheKey, manifestPromise)
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

function getConfiguredOutputExportDataUrl(
  url: URL,
  prefersTrailingSlash: boolean
): URL {
  const trailingSlash = process.env.__NEXT_TRAILING_SLASH
  const configuredUrl = new URL(url)
  const useTrailingSlash =
    trailingSlash == null
      ? prefersTrailingSlash
      : String(trailingSlash) === 'true'
  if (useTrailingSlash && !configuredUrl.pathname.endsWith('/')) {
    configuredUrl.pathname = `${configuredUrl.pathname}/`
  }
  return addOutputExportDataSuffix(configuredUrl)
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
  const { dataUrls, basePaths } = getOutputExportFallbackCacheStore()
  for (const candidateUrl of getOutputExportDataCandidates(renderedUrl)) {
    dataUrls.set(candidateUrl.href, resolvedDataUrl.href)
  }
  basePaths.set(
    normalizeOutputExportRouteDirectory(renderedUrl.pathname),
    normalizeOutputExportRouteDirectory(fallbackUrl.pathname)
  )
}

export function getCachedOutputExportFallbackDataUrl(url: URL): URL | null {
  const cached = getOutputExportFallbackCacheStore().dataUrls.get(url.href)
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
    getOutputExportFallbackCacheStore().basePaths.get(routeDirectory)
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
    const response = await fetchOutputExportDataResponseByUrl(dataUrl, init)
    if (response !== null) {
      return { response, dataUrl }
    }
  }

  return null
}

async function fetchConfiguredOutputExportDataResult(
  renderedUrl: URL,
  prefersTrailingSlash: boolean,
  init?: RequestInit
): Promise<{ response: Response; dataUrl: URL } | null> {
  const configuredDataUrl = getConfiguredOutputExportDataUrl(
    renderedUrl,
    prefersTrailingSlash
  )

  const response = await fetchOutputExportDataResponseByUrl(
    configuredDataUrl,
    init
  )
  if (response === null) {
    return null
  }

  return {
    response,
    dataUrl: configuredDataUrl,
  }
}

async function fetchOutputExportDataResponseByUrl(
  dataUrl: URL,
  init?: RequestInit
): Promise<Response | null> {
  const cacheKey = dataUrl.href
  const dataResponseCache = getOutputExportFallbackCacheStore().dataResponses

  let cachedResponse = dataResponseCache.get(cacheKey)
  if (cachedResponse === undefined) {
    cachedResponse = fetch(dataUrl, init)
      .then(async (response) => {
        const contentType = response.headers.get('content-type') || ''
        if (
          !response.ok ||
          !response.body ||
          !isOutputExportFlightContentType(contentType)
        ) {
          return null
        }

        return {
          body: await response.arrayBuffer(),
          headers: Array.from(response.headers.entries()),
          status: response.status,
          statusText: response.statusText,
        }
      })
      .catch((error) => {
        dataResponseCache.delete(cacheKey)
        throw error
      })
    dataResponseCache.set(cacheKey, cachedResponse)
  }

  const response = await cachedResponse
  if (response === null) {
    return null
  }

  return new Response(response.body.slice(0), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export async function fetchOutputExportDataResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<Response | null> {
  const result = await fetchOutputExportDataResult(renderedUrl, init)
  return result?.response ?? null
}

export async function fetchOutputExportNotFoundDataResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<Response | null> {
  for (const candidate of getOutputExportNotFoundCandidates(
    renderedUrl.pathname
  )) {
    const candidateUrl = new URL(renderedUrl)
    candidateUrl.pathname = candidate

    const result = await fetchOutputExportDataResult(candidateUrl, init)
    if (result !== null) {
      cacheOutputExportFallbackDataUrl(
        renderedUrl,
        candidateUrl,
        result.dataUrl
      )
      return result.response
    }
  }

  return null
}

export async function fetchOutputExportNotFoundResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<Response> {
  // The raw fallback should preserve the configured app root (for example a
  // basePath) without probing deeper missing prefixes that may be served by an
  // HTML fallback document instead of the RSC not-found payload.
  const candidateUrl = new URL(renderedUrl)
  candidateUrl.pathname = getConfiguredOutputExportNotFoundCandidate(
    renderedUrl.pathname
  )
  const configuredDataUrl = getConfiguredOutputExportDataUrl(
    candidateUrl,
    renderedUrl.pathname.endsWith('/')
  )

  cacheOutputExportFallbackDataUrl(renderedUrl, candidateUrl, configuredDataUrl)

  return fetch(configuredDataUrl, init)
}

export async function fetchOutputExportFallbackResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<{ response: Response; renderedUrl: URL; fallbackUrl: URL } | null> {
  const prefersTrailingSlash = renderedUrl.pathname.endsWith('/')

  for (const candidate of getOutputExportFallbackCandidates(
    renderedUrl.pathname
  )) {
    const candidateUrl = new URL(renderedUrl)
    candidateUrl.pathname = candidate

    const directResult = await fetchConfiguredOutputExportDataResult(
      candidateUrl,
      prefersTrailingSlash,
      init
    )
    if (directResult) {
      cacheOutputExportFallbackDataUrl(
        renderedUrl,
        candidateUrl,
        directResult.dataUrl
      )
      return {
        response: directResult.response,
        renderedUrl,
        fallbackUrl: candidateUrl,
      }
    }

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
        const basePath = process.env.__NEXT_ROUTER_BASEPATH || ''
        branchFallbackUrl.pathname = addPathPrefix(
          removePathPrefix(entry.fallbackPath, basePath),
          basePath
        )

        const result = await fetchConfiguredOutputExportDataResult(
          branchFallbackUrl,
          prefersTrailingSlash,
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
  }

  return null
}
