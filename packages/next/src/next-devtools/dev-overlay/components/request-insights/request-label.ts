import type { RequestInsight } from '../../../shared/request-insights'
import { removePathPrefix } from '../../../../shared/lib/router/utils/remove-path-prefix'

type RequestIdentity = Pick<RequestInsight, 'requestId' | 'route' | 'url'>

export type RequestRouteParam = {
  name: string
  value: string | string[]
}

export function getRequestDisplayUrl(request: RequestIdentity): string {
  return request.url ?? request.route ?? request.requestId
}

export function getRequestInsightAgentPrompt(
  request: Pick<RequestInsight, 'requestId'>
): string {
  return `Inspect Request Insights request ${request.requestId} with the get_request_insights MCP tool. Focus only on its server fetches. Trace slow, failed, or uncached fetches back to the application code, fix the underlying issue, and verify the request again in Request Insights.`
}

export function getRequestInsightSpanAgentPrompt(
  requestId: string,
  span: { spanId: string; label: string }
): string {
  return `Inspect Request Insights request ${requestId} with the get_request_insights MCP tool and focus on span ${span.spanId} (${span.label}). Explain what the span did, where its time went, and whether its children, fetches, cache behavior, or errors explain the duration.`
}

export function getRequestListDisplayUrl(
  request: RequestIdentity,
  rscRequest: boolean
): string {
  const displayUrl = getRequestDisplayUrl(request)
  if (!rscRequest) {
    return displayUrl
  }

  try {
    const protocolRelative = displayUrl.startsWith('//')
    const rootRelative = !protocolRelative && displayUrl.startsWith('/')
    const parsed = new URL(displayUrl, 'http://next.local')
    if (!parsed.searchParams.has('_rsc')) {
      return displayUrl
    }

    parsed.searchParams.delete('_rsc')
    return protocolRelative
      ? `//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
      : rootRelative
        ? `${parsed.pathname}${parsed.search}${parsed.hash}`
        : parsed.toString()
  } catch {
    return displayUrl
  }
}

export function getRequestRouteParams(
  request: Pick<RequestIdentity, 'route' | 'url'>,
  basePath = process.env.__NEXT_ROUTER_BASEPATH || ''
): RequestRouteParam[] | undefined {
  if (!request.route || !request.url) {
    return undefined
  }

  const pathname = getPathname(request.url)
  if (!pathname) {
    return undefined
  }

  const routeSegments = splitPathname(request.route)
  const pathnameSegments = splitPathname(removePathPrefix(pathname, basePath))
  if (!routeSegments || !pathnameSegments) {
    return undefined
  }

  const params: RequestRouteParam[] = []
  const names = new Set<string>()
  let pathnameIndex = 0

  for (const routeSegment of routeSegments) {
    const dynamicSegment = parseDynamicSegment(routeSegment)

    if (!dynamicSegment) {
      if (
        routeSegment.includes('[') ||
        routeSegment.includes(']') ||
        pathnameSegments[pathnameIndex] !== routeSegment
      ) {
        return undefined
      }
      pathnameIndex += 1
      continue
    }

    if (names.has(dynamicSegment.name)) {
      return undefined
    }
    names.add(dynamicSegment.name)

    if (dynamicSegment.catchAll) {
      const value = pathnameSegments.slice(pathnameIndex)
      if (value.length === 0 && !dynamicSegment.optional) {
        return undefined
      }
      params.push({ name: dynamicSegment.name, value })
      pathnameIndex = pathnameSegments.length
      continue
    }

    const value = pathnameSegments[pathnameIndex]
    if (value === undefined) {
      return undefined
    }
    params.push({ name: dynamicSegment.name, value })
    pathnameIndex += 1
  }

  return pathnameIndex === pathnameSegments.length ? params : undefined
}

export function formatRequestRouteParams(params: RequestRouteParam[]): string {
  return JSON.stringify(
    Object.fromEntries(params.map(({ name, value }) => [name, value])),
    null,
    2
  )
}

function getPathname(url: string): string | undefined {
  try {
    if (url.startsWith('/')) {
      return new URL(url, 'http://next.local').pathname
    }

    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.pathname
      : undefined
  } catch {
    return undefined
  }
}

function splitPathname(pathname: string): string[] | undefined {
  if (!pathname.startsWith('/')) {
    return undefined
  }

  const segments = pathname.split('/').slice(1)
  if (segments.at(-1) === '') {
    segments.pop()
  }

  const decoded: string[] = []
  for (const segment of segments) {
    const value = decodeSegment(segment)
    if (value === undefined) {
      return undefined
    }
    decoded.push(value)
  }
  return decoded
}

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}

function parseDynamicSegment(segment: string):
  | {
      name: string
      catchAll: boolean
      optional: boolean
    }
  | undefined {
  const optionalCatchAll = segment.match(/^\[\[\.\.\.([^[/\]]+)\]\]$/)
  const catchAll = segment.match(/^\[\.\.\.([^[/\]]+)\]$/)
  const dynamic = segment.match(/^\[([^[/\]]+)\]$/)
  const match = optionalCatchAll ?? catchAll ?? dynamic

  if (!match) {
    return undefined
  }

  return {
    name: match[1],
    catchAll: optionalCatchAll !== null || catchAll !== null,
    optional: optionalCatchAll !== null,
  }
}
