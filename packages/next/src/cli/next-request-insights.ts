import path from 'path'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'
import { getProjectDir } from '../lib/get-project-dir'
import {
  getRequestInsightKind,
  type RequestInsight,
  type RequestInsightKind,
  type RequestInsightsSnapshot,
} from '../shared/lib/request-insights'
import { summarizeRequestInsight } from '../shared/lib/request-insights-summary'
import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import {
  PHASE_DEVELOPMENT_SERVER,
  REQUEST_INSIGHTS_DEV_ENDPOINT,
} from '../shared/lib/constants'

const DEFAULT_REQUEST_LIMIT = 20
const DEFAULT_FETCH_LIMIT = 5
const DEV_SERVER_DISCOVERY_TIMEOUT_MS = 1000
const DEV_SERVER_DISCOVERY_RETRY_MS = 50

export type NextRequestInsightsOptions = {
  url?: string
  json?: boolean
  limit?: number
  requestId?: string
  kind?: RequestInsightKind
  route?: string
  sort?: 'newest' | 'start'
  view?: 'list'
}

export async function nextRequestInsights(
  options: NextRequestInsightsOptions,
  directory?: string
) {
  const devServerUrl = options.url
    ? parseDevServerUrl(options.url)
    : await discoverDevServerUrl(directory)
  const endpoint = new URL(REQUEST_INSIGHTS_DEV_ENDPOINT, devServerUrl)
  const response = await fetch(endpoint).catch((error) => {
    printAndExit(
      `Failed to reach ${endpoint.toString()}: ${error instanceof Error ? error.message : String(error)}`,
      1
    )
    throw error
  })

  const text = await response.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    printAndExit(`Invalid response from ${endpoint.toString()}: ${text}`, 1)
  }

  if (!response.ok) {
    printAndExit(getResponseError(data, response.status), 1)
  }

  if (!isRequestInsightsSnapshot(data)) {
    exitWithError(
      `Invalid response from ${endpoint.toString()}: expected requests and fetches to be arrays.`
    )
  }

  const selectedRequest = options.requestId
    ? findRequest(data.requests, options.requestId, options.kind)
    : undefined

  if (options.view === 'list') {
    const route = options.route
    const requests = route
      ? data.requests.filter((request) => matchesRoute(request, route))
      : data.requests
    const limit = options.limit ?? DEFAULT_REQUEST_LIMIT
    const visibleRequests =
      options.sort === 'start'
        ? [...requests]
            .sort((first, second) => first.startTime - second.startTime)
            .slice(0, limit)
        : requests.slice(-limit).reverse()
    if (options.json) {
      console.log(
        JSON.stringify(
          { requests: visibleRequests.map(summarizeListRequest) },
          null,
          2
        )
      )
    } else {
      printRequestList(
        visibleRequests,
        requests.length,
        data.requests,
        options.sort === 'start'
      )
    }
    return
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        selectedRequest ? { request: selectedRequest } : data,
        null,
        2
      )
    )
    return
  }

  if (selectedRequest) {
    printRequestDetails(selectedRequest, data.requests)
    return
  }

  const requests = data.requests
  if (requests.length === 0) {
    console.log('No request insights captured yet.')
    return
  }

  const limit = options.limit ?? DEFAULT_REQUEST_LIMIT
  const visibleRequests = requests.slice(-limit).reverse()
  printRequestList(visibleRequests, requests.length, data.requests)
}

function summarizeListRequest(request: RequestInsight) {
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

function printRequestList(
  visibleRequests: RequestInsight[],
  totalRequests: number,
  retainedRequests: RequestInsight[],
  timeline = false
): void {
  console.log(
    `Showing ${visibleRequests.length} of ${totalRequests} retained requests (newest first).`
  )

  const firstStart = Math.min(
    ...retainedRequests.map((request) => request.startTime)
  )
  const displayIds = getUniqueDisplayIds(retainedRequests)

  for (const request of visibleRequests) {
    const route = request.route ?? request.url ?? request.requestId
    const kind = getRequestInsightKind(request)
    const duration = formatDuration(request.durationMs)
    console.log(
      `${kind === 'instant-insights' ? `Instant Insights · ${route}` : route} ${duration} ${request.status ?? 'pending'}`
    )
    console.log(
      `  kind ${kind} id ${displayIds.get(request) ?? request.requestId} page ${shortId(request.htmlRequestId)}`
    )
    if (request.parentRequestId) {
      console.log(`  parent ${request.parentRequestId}`)
    }
    if (timeline) {
      const start = request.startTime - firstStart
      const end =
        typeof request.durationMs === 'number'
          ? start + request.durationMs
          : undefined
      console.log(
        `  timeline +${formatDuration(start)} to ${end === undefined ? 'pending' : `+${formatDuration(end)}`}`
      )
    }

    const visibleFetches = request.fetches.slice(0, DEFAULT_FETCH_LIMIT)
    if (visibleFetches.length < request.fetches.length) {
      console.log(
        `  showing first ${visibleFetches.length} of ${request.fetches.length} fetches`
      )
    }

    for (const fetch of visibleFetches) {
      console.log(
        `  fetch ${formatDuration(fetch.durationMs)} ${fetch.statusCode ?? '-'} ${fetch.cacheStatus ?? 'unknown'} ${fetch.method ?? 'GET'} ${fetch.url ?? ''}`
      )
    }
  }
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
  const exact = candidates.filter((request) => request.requestId === id)
  const matches =
    exact.length > 0
      ? exact
      : candidates.filter((request) => request.requestId.startsWith(id))
  if (matches.length === 0) {
    return exitWithError(`No retained request matches "${id}".`)
  }
  const matchedIds = new Set(matches.map((request) => request.requestId))
  if (matchedIds.size > 1) {
    return exitWithError(
      `Request ID prefix "${id}" is ambiguous (${matchedIds.size} matches).\nCandidates:\n${matches
        .map(
          (request) =>
            `  ${request.requestId} ${getRequestInsightKind(request)} ${request.route ?? request.url ?? '-'}`
        )
        .join('\n')}`
    )
  }
  // Instant Insights entries share the request ID of the request they validated.
  return (
    matches.find((request) => getRequestInsightKind(request) === 'request') ??
    matches[0]
  )
}

function printRequestDetails(
  request: RequestInsight,
  retainedRequests: RequestInsight[]
): void {
  const route = request.route ?? request.url ?? request.requestId
  console.log(
    `${route} ${formatDuration(request.durationMs)} ${request.status}`
  )
  console.log(`  request ${request.requestId}`)
  console.log(`  page ${request.htmlRequestId}`)
  if (request.parentRequestId) {
    console.log(`  parent ${request.parentRequestId}`)
  }

  const overlaps = getOverlappingRequests(request, retainedRequests)
  if (overlaps.length > 0) {
    console.log('  Overlapping requests:')
    for (const overlap of overlaps) {
      console.log(
        `    ${formatDuration(overlap.durationMs)} ${getRequestInsightKind(overlap.request)} ${overlap.request.requestId} ${overlap.request.route ?? overlap.request.url ?? '-'}`
      )
    }
  }

  if (request.spans.length === 0) {
    console.log('  No spans recorded.')
    return
  }

  console.log('  Spans (relative to request start):')
  for (const span of [...request.spans].sort(
    (first, second) => first.startTime - second.startTime
  )) {
    const offset = Math.max(0, span.startTime - request.startTime)
    console.log(
      `    +${formatDuration(offset)} ${formatDuration(span.durationMs)} ${span.name}`
    )
    console.log(
      `      span ${span.spanId ?? '-'} parent ${span.parentSpanId ?? '-'}`
    )
    const url = span.attributes?.['http.url']
    const cacheStatus = span.attributes?.['next.fetch.cache_status']
    const cacheReason = span.attributes?.['next.fetch.cache_reason']
    if (typeof url === 'string') {
      console.log(
        `      fetch ${url}${typeof cacheStatus === 'string' ? ` cache ${cacheStatus}` : ''}${typeof cacheReason === 'string' ? ` (${cacheReason})` : ''}`
      )
    }
  }

  const shellWait = request.spans.find(
    (span) =>
      span.attributes?.['next.span_type'] === 'AppRender.waitShellReady' ||
      span.name === 'AppRender.waitShellReady'
  )
  if (
    typeof shellWait?.durationMs === 'number' &&
    shellWait.durationMs >= 100 &&
    shellWait.durationMs >= (request.durationMs ?? 0) / 2
  ) {
    console.log(
      '  Shell readiness dominates this request. Component-level timing is not currently captured.'
    )
  }
}

async function discoverDevServerUrl(directory?: string): Promise<URL> {
  const projectDir = getProjectDir(directory)
  const defaultLockfilePath = path.join(projectDir, '.next', 'lock')
  const defaultServerUrl = readDevServerUrl(defaultLockfilePath)
  if (defaultServerUrl) return defaultServerUrl

  let lockfilePath = defaultLockfilePath
  try {
    const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, projectDir)
    lockfilePath = path.join(projectDir, config.distDir, 'lock')
  } catch {
    // Discovery must not fail because application config has side effects.
  }
  const deadline = Date.now() + DEV_SERVER_DISCOVERY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const serverUrl = readDevServerUrl(lockfilePath)
    if (serverUrl) return serverUrl

    await new Promise((resolve) =>
      setTimeout(resolve, DEV_SERVER_DISCOVERY_RETRY_MS)
    )
  }

  return exitWithError(
    `Unable to discover a running Next.js dev server from ${lockfilePath}. Start next dev or pass --url.`
  )
}

function readDevServerUrl(lockfilePath: string): URL | undefined {
  const lockfileContent = readLockfileContent(lockfilePath)
  const serverInfo = lockfileContent
    ? parseDevServerInfo(lockfileContent)
    : undefined
  return serverInfo && typeof serverInfo.appUrl === 'string'
    ? parseDevServerUrl(serverInfo.appUrl)
    : undefined
}

function exitWithError(message: string): never {
  return printAndExit(message, 1) as never
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
    return exitWithError(
      `Invalid dev server URL "${value}". Pass a valid HTTP or HTTPS URL.`
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return exitWithError(
      `Invalid dev server URL "${value}". Pass a valid HTTP or HTTPS URL.`
    )
  }

  return url
}

function formatDuration(durationMs: number | undefined): string {
  if (typeof durationMs !== 'number') {
    return '-'
  }

  return durationMs < 1000
    ? `${Math.round(durationMs)}ms`
    : `${(durationMs / 1000).toFixed(2)}s`
}

function shortId(id: string | undefined): string {
  if (!id) {
    return '-'
  }

  return id.length > 8 ? id.slice(0, 8) : id
}

function getUniqueDisplayIds(
  requests: RequestInsight[]
): Map<RequestInsight, string> {
  const result = new Map<RequestInsight, string>()
  for (const request of requests) {
    let length = Math.min(8, request.requestId.length)
    while (
      length < request.requestId.length &&
      !isUniqueRequestPrefix(requests, request, length)
    ) {
      length++
    }
    result.set(request, request.requestId.slice(0, length))
  }
  return result
}

function isUniqueRequestPrefix(
  requests: RequestInsight[],
  request: RequestInsight,
  length: number
): boolean {
  const prefix = request.requestId.slice(0, length)
  return !requests.some(
    (candidate) =>
      candidate !== request && candidate.requestId.startsWith(prefix)
  )
}

function getOverlappingRequests(
  request: RequestInsight,
  requests: RequestInsight[]
): Array<{ request: RequestInsight; durationMs: number }> {
  const requestEnd = request.startTime + (request.durationMs ?? 0)
  return requests
    .filter((candidate) => candidate !== request)
    .map((candidate) => {
      const candidateEnd = candidate.startTime + (candidate.durationMs ?? 0)
      return {
        request: candidate,
        durationMs:
          Math.min(requestEnd, candidateEnd) -
          Math.max(request.startTime, candidate.startTime),
      }
    })
    .filter((overlap) => overlap.durationMs > 0)
    .sort((first, second) => second.durationMs - first.durationMs)
}
