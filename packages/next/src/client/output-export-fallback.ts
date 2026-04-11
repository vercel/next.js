import {
  getOutputExportFallbackMetadataPath,
  getOutputExportFallbackPath,
  type OutputExportFallbackManifestEntry,
} from '../lib/output-export-dynamic-fallback'
import { RSC_CONTENT_TYPE_HEADER } from './components/app-router-headers'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'

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
): Promise<{
  version: 1
  routes: OutputExportFallbackManifestEntry[]
} | null> {
  const metadataResponse = await fetch(
    getOutputExportFallbackMetadataUrl(fallbackUrl),
    init
  )
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

export async function fetchOutputExportDataResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<Response | null> {
  for (const dataUrl of getOutputExportDataCandidates(renderedUrl)) {
    const response = await fetch(dataUrl, init)
    const contentType = response.headers.get('content-type') || ''
    const isFlightResponse =
      contentType.startsWith(RSC_CONTENT_TYPE_HEADER) ||
      contentType.startsWith('text/plain') ||
      contentType.startsWith('application/octet-stream')

    if (response.ok && response.body && isFlightResponse) {
      return response
    }
  }

  return null
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

        const response = await fetchOutputExportDataResponse(
          branchFallbackUrl,
          init
        )
        if (response) {
          return {
            response,
            renderedUrl,
            fallbackUrl: branchFallbackUrl,
          }
        }
      }
    }

    const response = await fetchOutputExportDataResponse(candidateUrl, init)
    if (response) {
      return { response, renderedUrl, fallbackUrl: candidateUrl }
    }
  }

  return null
}
