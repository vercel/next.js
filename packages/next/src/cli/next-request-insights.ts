import path from 'path'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'
import { getProjectDir } from '../lib/get-project-dir'
import { formatDuration } from '../shared/lib/format-duration'
import {
  getRequestInsightKind,
  isRequestInsightFor,
  type RequestInsight,
  type RequestInsightFetch,
  type RequestInsightKind,
  type RequestInsightsSnapshot,
} from '../shared/lib/request-insights'
import {
  summarizeRequestInsight,
  type RequestInsightSummary,
} from '../shared/lib/request-insights-summary'
import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import {
  PHASE_DEVELOPMENT_SERVER,
  REQUEST_INSIGHTS_DEV_ENDPOINT,
} from '../shared/lib/constants'

const DEFAULT_FETCH_LIMIT = 5
const DEV_SERVER_DISCOVERY_TIMEOUT_MS = 1000
const DEV_SERVER_DISCOVERY_RETRY_MS = 50

type DevServerOptions = {
  url?: string
}

export type ListRequestInsightsOptions = DevServerOptions & {
  json?: boolean
  route?: string
  limit: number
}

export type GetRequestInsightOptions = DevServerOptions & {
  json?: boolean
  kind?: RequestInsightKind
}

export async function listRequestInsights(
  options: ListRequestInsightsOptions,
  directory?: string
) {
  const snapshot = await loadSnapshot(options, directory)
  const { route } = options
  const requests = route
    ? snapshot.requests.filter((request) => matchesRoute(request, route))
    : snapshot.requests
  const visibleRequests = requests.slice(-options.limit).reverse()

  if (options.json) {
    console.log(
      JSON.stringify(
        { requests: visibleRequests.map(summarizeListRequest) },
        null,
        2
      )
    )
    return
  }

  if (requests.length === 0) {
    console.log(
      route
        ? `No retained requests match "${route}".`
        : 'No request insights captured yet.'
    )
    return
  }

  console.log(
    `Showing ${visibleRequests.length} of ${requests.length} ${route ? 'matching' : 'retained'} requests (newest first).`
  )
  for (const request of visibleRequests) {
    printRequestSummary(request)
  }
}

export async function getRequestInsight(
  requestId: string,
  options: GetRequestInsightOptions,
  directory?: string
) {
  const snapshot = await loadSnapshot(options, directory)
  const request = findRequest(snapshot.requests, requestId, options.kind)

  if (options.json) {
    console.log(JSON.stringify({ request }, null, 2))
  } else {
    printRequestDetails(request)
  }
}

async function loadSnapshot(
  options: DevServerOptions,
  directory: string | undefined
): Promise<RequestInsightsSnapshot> {
  const devServerUrl = options.url
    ? parseDevServerUrl(options.url)
    : await discoverDevServerUrl(directory)
  const endpoint = new URL(REQUEST_INSIGHTS_DEV_ENDPOINT, devServerUrl)

  const response = await fetch(endpoint).catch((error) =>
    printAndExit(
      `Failed to reach ${endpoint.toString()}: ${error instanceof Error ? error.message : String(error)}`
    )
  )

  const text = await response.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    printAndExit(`Invalid response from ${endpoint.toString()}: ${text}`)
  }

  if (!response.ok) {
    printAndExit(getResponseError(data, response.status))
  }

  if (!isRequestInsightsSnapshot(data)) {
    return printAndExit(
      `Invalid response from ${endpoint.toString()}: expected requests and fetches to be arrays.`
    )
  }

  return data
}

type RequestInsightListEntry = Pick<
  RequestInsightSummary,
  | 'requestId'
  | 'source'
  | 'route'
  | 'url'
  | 'startTime'
  | 'durationMs'
  | 'status'
  | 'statusCode'
  | 'isRsc'
  | 'spanCount'
  | 'fetchCount'
  | 'cacheStatuses'
  | 'hasError'
> & { kind: RequestInsightKind }

function summarizeListRequest(
  request: RequestInsight
): RequestInsightListEntry {
  const summary = summarizeRequestInsight(request)
  return {
    requestId: summary.requestId,
    kind: getRequestInsightKind(summary),
    source: summary.source,
    route: summary.route,
    url: summary.url,
    startTime: summary.startTime,
    durationMs: summary.durationMs,
    status: summary.status,
    statusCode: summary.statusCode,
    isRsc: summary.isRsc,
    spanCount: summary.spanCount,
    fetchCount: summary.fetchCount,
    cacheStatuses: summary.cacheStatuses,
    hasError: summary.hasError,
  }
}

function printRequestSummary(request: RequestInsight): void {
  const route = getDisplayRoute(request)
  const kind = getRequestInsightKind(request)
  console.log(
    `${kind === 'instant-insights' ? `Instant Insights · ${route}` : route} ${formatDuration(request.durationMs)} ${request.status}`
  )
  console.log(
    `  kind ${kind} request ${shortId(request.requestId)} page ${shortId(request.htmlRequestId)}`
  )

  const visibleFetches = request.fetches.slice(0, DEFAULT_FETCH_LIMIT)
  if (visibleFetches.length < request.fetches.length) {
    console.log(
      `  showing first ${visibleFetches.length} of ${request.fetches.length} fetches`
    )
  }
  for (const fetch of visibleFetches) {
    console.log(`  fetch ${formatFetch(fetch)}`)
  }
}

function printRequestDetails(request: RequestInsight): void {
  console.log(
    `${getDisplayRoute(request)} ${formatDuration(request.durationMs)} ${request.status}`
  )
  console.log(`  request ${request.requestId}`)
  console.log(`  page ${request.htmlRequestId}`)

  if (request.spans.length === 0) {
    console.log('  No spans recorded.')
  } else {
    console.log('  Spans (relative to request start):')
    for (const span of [...request.spans].sort(
      (first, second) => first.startTime - second.startTime
    )) {
      console.log(
        `    +${formatOffset(request, span.startTime)} ${formatDuration(span.durationMs)} ${span.name}`
      )
      console.log(
        `      span ${span.spanId ?? '-'} parent ${span.parentSpanId ?? '-'}`
      )
    }
  }

  if (request.fetches.length > 0) {
    console.log('  Fetches (relative to request start):')
    for (const fetch of request.fetches) {
      console.log(
        `    +${formatOffset(request, fetch.startTime)} ${formatFetch(fetch)}`
      )
    }
  }
}

function formatFetch(fetch: RequestInsightFetch): string {
  const cacheReason = fetch.cacheReason ? ` (${fetch.cacheReason})` : ''
  return `${formatDuration(fetch.durationMs)} ${fetch.statusCode ?? '-'} ${fetch.cacheStatus ?? 'unknown'}${cacheReason} ${fetch.method ?? 'GET'} ${fetch.url ?? ''}`
}

function formatOffset(
  request: RequestInsight,
  startTime: number | undefined
): string {
  return startTime === undefined
    ? '-'
    : formatDuration(Math.max(0, startTime - request.startTime))
}

function getDisplayRoute(request: RequestInsight): string {
  return request.route ?? request.url ?? request.requestId
}

function matchesRoute(request: RequestInsight, route: string): boolean {
  if (request.route === route) return true
  if (!request.url) return false

  try {
    return new URL(request.url, 'http://next.local').pathname === route
  } catch {
    return false
  }
}

function findRequest(
  requests: RequestInsight[],
  id: string,
  kind?: RequestInsightKind
): RequestInsight {
  const candidates = kind
    ? requests.filter((request) => getRequestInsightKind(request) === kind)
    : requests
  const requestId = resolveRequestId(
    candidates.map((request) => request.requestId),
    id
  )
  const related = candidates.filter((request) =>
    isRequestInsightFor(request, requestId)
  )
  // `get` shows one entry; the request wins over its Instant Insights entry
  // unless --kind asks for the latter.
  return (
    related.find((request) => getRequestInsightKind(request) === 'request') ??
    related[0]
  )
}

function resolveRequestId(requestIds: string[], id: string): string {
  if (requestIds.includes(id)) return id
  const matches = new Set(
    requestIds.filter((requestId) => requestId.startsWith(id))
  )
  if (matches.size === 0) {
    return printAndExit(`No retained request matches "${id}".`)
  }
  if (matches.size > 1) {
    return printAndExit(
      `Request ID prefix "${id}" is ambiguous (${matches.size} matches).`
    )
  }
  return [...matches][0]
}

async function discoverDevServerUrl(directory?: string): Promise<URL> {
  const projectDir = getProjectDir(directory)
  const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, projectDir)
  const lockfilePath = path.join(projectDir, config.distDir, 'lock')
  const deadline = Date.now() + DEV_SERVER_DISCOVERY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const lockfileContent = readLockfileContent(lockfilePath)
    const serverInfo = lockfileContent
      ? parseDevServerInfo(lockfileContent)
      : undefined

    if (serverInfo && typeof serverInfo.appUrl === 'string') {
      return parseDevServerUrl(serverInfo.appUrl)
    }

    await new Promise((resolve) =>
      setTimeout(resolve, DEV_SERVER_DISCOVERY_RETRY_MS)
    )
  }

  return printAndExit(
    `Unable to discover a running Next.js dev server from ${lockfilePath}. Start next dev or pass --url.`
  )
}

function getResponseError(data: unknown, status: number): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error
  }

  return `Request failed with ${status}`
}

function isRequestInsightsSnapshot(
  data: unknown
): data is RequestInsightsSnapshot {
  return (
    typeof data === 'object' &&
    data !== null &&
    'requests' in data &&
    Array.isArray(data.requests) &&
    data.requests.every(isRequestInsight)
  )
}

function isRequestInsight(request: unknown): request is RequestInsight {
  return (
    typeof request === 'object' &&
    request !== null &&
    'fetches' in request &&
    Array.isArray(request.fetches)
  )
}

function parseDevServerUrl(value: string): URL {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return printAndExit(
      `Invalid dev server URL "${value}". Pass a valid HTTP or HTTPS URL.`
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return printAndExit(
      `Invalid dev server URL "${value}". Pass a valid HTTP or HTTPS URL.`
    )
  }

  return url
}

function shortId(id: string | undefined): string {
  if (!id) {
    return '-'
  }

  return id.length > 8 ? id.slice(0, 8) : id
}
