import {
  getOutputExportFallbackRouteManifestPath,
  getOutputExportFallbackPath,
  type OutputExportFallbackRouteManifestEntry,
} from '../lib/output-export-dynamic-fallback'
import { addPathPrefix } from '../shared/lib/router/utils/add-path-prefix'
import { removePathPrefix } from '../shared/lib/router/utils/remove-path-prefix'
import { RSC_CONTENT_TYPE_HEADER } from './components/app-router-headers'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'

type OutputExportFallbackRouteManifest = {
  version: 1
  routes: OutputExportFallbackRouteManifestEntry[]
}

type OutputExportFallbackCacheStore = {
  routeManifests: Map<string, Promise<OutputExportFallbackRouteManifest | null>>
  // Only dedupe while the static asset request is in flight. Once the response
  // has been decoded, the segment cache owns the fulfilled route data.
  inFlightDataResponses: Map<
    string,
    Promise<OutputExportInFlightResponse | null>
  >
}

type OutputExportInFlightResponse = {
  body: ArrayBuffer
  headers: Array<[string, string]>
  status: number
  statusText: string
}

type OutputExportFallbackResponseResult = {
  response: Response
  renderedUrl: URL
  fallbackUrl: URL
}

const outputExportFallbackCacheStore: OutputExportFallbackCacheStore = {
  routeManifests: new Map<
    string,
    Promise<OutputExportFallbackRouteManifest | null>
  >(),
  inFlightDataResponses: new Map<
    string,
    Promise<OutputExportInFlightResponse | null>
  >(),
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

export function clearOutputExportFallbackRouteManifestCache(): void {
  outputExportFallbackCacheStore.routeManifests.clear()
  outputExportFallbackCacheStore.inFlightDataResponses.clear()
}

function getOutputExportFallbackRouteManifestUrl(url: URL): URL {
  const nextUrl = new URL(url)
  nextUrl.pathname = getOutputExportFallbackRouteManifestPath(nextUrl.pathname)
  return nextUrl
}

function matchOutputExportFallbackRouteManifestEntry(
  entry: OutputExportFallbackRouteManifestEntry,
  pathname: string
): boolean {
  const basePath = process.env.__NEXT_ROUTER_BASEPATH || ''
  const matcher = getRouteMatcher(getRouteRegex(entry.route))
  return matcher(removePathPrefix(pathname, basePath)) !== false
}

async function fetchOutputExportFallbackRouteManifest(
  fallbackUrl: URL,
  init?: RequestInit
): Promise<OutputExportFallbackRouteManifest | null> {
  const routeManifestUrl = getOutputExportFallbackRouteManifestUrl(fallbackUrl)
  const cacheKey = routeManifestUrl.href
  const routeManifestCache = outputExportFallbackCacheStore.routeManifests
  const cached = routeManifestCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const routeManifestPromise = fetch(routeManifestUrl, init)
    .then(async (routeManifestResponse) => {
      if (!routeManifestResponse.ok) {
        return null
      }

      const contentType =
        routeManifestResponse.headers.get('content-type') || ''
      if (
        !contentType.startsWith('application/json') &&
        !contentType.startsWith('text/json')
      ) {
        return null
      }

      return routeManifestResponse.json()
    })
    .catch((error) => {
      routeManifestCache.delete(cacheKey)
      throw error
    })

  routeManifestCache.set(cacheKey, routeManifestPromise)
  return routeManifestPromise
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

async function fetchOutputExportDataResult(
  renderedUrl: URL,
  init?: RequestInit
): Promise<Response | null> {
  for (const dataUrl of getOutputExportDataCandidates(renderedUrl)) {
    const response = await fetchOutputExportDataResponseByUrl(dataUrl, init)
    if (response !== null) {
      return response
    }
  }

  return null
}

async function fetchConfiguredOutputExportDataResult(
  renderedUrl: URL,
  prefersTrailingSlash: boolean,
  init?: RequestInit
): Promise<Response | null> {
  const configuredDataUrl = getConfiguredOutputExportDataUrl(
    renderedUrl,
    prefersTrailingSlash
  )

  return fetchOutputExportDataResponseByUrl(configuredDataUrl, init)
}

async function fetchOutputExportDataResponseByUrl(
  dataUrl: URL,
  init?: RequestInit
): Promise<Response | null> {
  const cacheKey = dataUrl.href
  const inFlightDataResponses =
    outputExportFallbackCacheStore.inFlightDataResponses
  let inFlightResponse = inFlightDataResponses.get(cacheKey)
  if (inFlightResponse === undefined) {
    inFlightResponse = fetch(dataUrl, init)
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
      .finally(() => {
        inFlightDataResponses.delete(cacheKey)
      })
    inFlightDataResponses.set(cacheKey, inFlightResponse)
  }

  const response = await inFlightResponse
  if (response === null) {
    return null
  }

  return new Response(response.body.slice(0), {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export async function fetchOutputExportNotFoundDataResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<OutputExportFallbackResponseResult | null> {
  for (const candidate of getOutputExportNotFoundCandidates(
    renderedUrl.pathname
  )) {
    const candidateUrl = new URL(renderedUrl)
    candidateUrl.pathname = candidate

    const result = await fetchOutputExportDataResult(candidateUrl, init)
    if (result !== null) {
      return {
        response: result,
        renderedUrl,
        fallbackUrl: candidateUrl,
      }
    }
  }

  return null
}

export async function fetchOutputExportNotFoundResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<OutputExportFallbackResponseResult> {
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

  return {
    response: await fetch(configuredDataUrl, init),
    renderedUrl,
    fallbackUrl: candidateUrl,
  }
}

export async function fetchOutputExportFallbackResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<OutputExportFallbackResponseResult | null> {
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
    const fallbackRouteManifest = await fetchOutputExportFallbackRouteManifest(
      candidateUrl,
      init
    )
    if (fallbackRouteManifest !== null) {
      // A single-route manifest may still point at the public candidate path,
      // in which case the direct result is the right response. When several
      // routes share a prefix, each entry points at a private `__route_*`
      // variant and we fetch that branch-specific asset below.
      for (const entry of fallbackRouteManifest.routes) {
        if (
          !matchOutputExportFallbackRouteManifestEntry(
            entry,
            renderedUrl.pathname
          )
        ) {
          continue
        }

        const branchFallbackUrl = new URL(renderedUrl)
        const basePath = process.env.__NEXT_ROUTER_BASEPATH || ''
        branchFallbackUrl.pathname = addPathPrefix(
          removePathPrefix(entry.fallbackPath, basePath),
          basePath
        )

        if (directResult) {
          return {
            response: directResult,
            renderedUrl,
            fallbackUrl: branchFallbackUrl,
          }
        }

        const result = await fetchConfiguredOutputExportDataResult(
          branchFallbackUrl,
          prefersTrailingSlash,
          init
        )
        if (result) {
          return {
            response: result,
            renderedUrl,
            fallbackUrl: branchFallbackUrl,
          }
        }
      }

      continue
    }

    if (directResult) {
      return {
        response: directResult,
        renderedUrl,
        fallbackUrl: candidateUrl,
      }
    }
  }

  return null
}
