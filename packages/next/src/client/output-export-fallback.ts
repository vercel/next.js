import { getOutputExportFallbackPath } from '../lib/output-export-dynamic-fallback'
import { RSC_CONTENT_TYPE_HEADER } from './components/app-router-headers'

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

async function fetchConfiguredOutputExportDataResult(
  renderedUrl: URL,
  prefersTrailingSlash: boolean,
  init?: RequestInit
): Promise<{ response: Response; dataUrl: URL } | null> {
  const configuredDataUrl = getConfiguredOutputExportDataUrl(
    renderedUrl,
    prefersTrailingSlash
  )

  const response = await fetch(configuredDataUrl, init)
  const contentType = response.headers.get('content-type') || ''
  if (
    !response.ok ||
    !response.body ||
    !isOutputExportFlightContentType(contentType)
  ) {
    return null
  }

  return {
    response,
    dataUrl: configuredDataUrl,
  }
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

    const result = await fetchConfiguredOutputExportDataResult(
      candidateUrl,
      prefersTrailingSlash,
      init
    )
    if (result) {
      return {
        response: result.response,
        renderedUrl,
        fallbackUrl: candidateUrl,
      }
    }
  }

  return null
}
