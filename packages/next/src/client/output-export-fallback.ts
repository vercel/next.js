import { RSC_CONTENT_TYPE_HEADER } from './components/app-router-headers'

export function getOutputExportFallbackCandidates(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean)
  const candidates: string[] = []

  for (let i = segments.length - 1; i >= 0; i--) {
    const prefix = segments.slice(0, i).join('/')
    candidates.push(prefix.length > 0 ? `/${prefix}/__fallback` : '/__fallback')
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
    const isFlightResponse =
      contentType.startsWith(RSC_CONTENT_TYPE_HEADER) ||
      contentType.startsWith('text/plain')

    if (response.ok && response.body && isFlightResponse) {
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
