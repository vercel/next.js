import { getOutputExportFallbackPath } from '../lib/output-export-dynamic-fallback'

export function getOutputExportFallbackCandidates(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean)
  const candidates: string[] = []

  for (let i = segments.length; i >= 0; i--) {
    const prefix = segments.slice(0, i).join('/')
    candidates.push(getOutputExportFallbackPath(prefix))
  }

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
    // Reject HTML responses (likely the host's error page) and responses
    // with no content-type (likely a piped error document). Accept any
    // other type: static hosts serve .txt as text/plain, application/
    // octet-stream, or other types depending on configuration.
    const isValidResponse =
      contentType !== '' &&
      !contentType.startsWith('text/html') &&
      !contentType.startsWith('application/xhtml')

    if (response.ok && response.body && isValidResponse) {
      return response
    }
  }

  return null
}

export async function fetchOutputExportFallbackResponse(
  renderedUrl: URL,
  init?: RequestInit
): Promise<{ response: Response; renderedUrl: URL } | null> {
  for (const candidate of getOutputExportFallbackCandidates(
    renderedUrl.pathname
  )) {
    const candidateUrl = new URL(renderedUrl)
    candidateUrl.pathname = candidate

    const response = await fetchOutputExportDataResponse(candidateUrl, init)
    if (response) {
      return { response, renderedUrl }
    }
  }

  return null
}
