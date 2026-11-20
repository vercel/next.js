import path from 'path'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'
import { getProjectDir } from '../lib/get-project-dir'
import {
  getRequestInsightKind,
  type RequestInsight,
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
  route?: string
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
    ? findRequest(data.requests, options.requestId)
    : undefined

  if (options.view === 'list') {
    const route = options.route
    const requests = route
      ? data.requests.filter((request) => matchesRoute(request, route))
      : data.requests
    const limit = options.limit ?? DEFAULT_REQUEST_LIMIT
    const visibleRequests = requests.slice(-limit).reverse()
    if (options.json) {
      console.log(
        JSON.stringify(
          { requests: visibleRequests.map(summarizeListRequest) },
          null,
          2
        )
      )
    } else {
      printRequestList(visibleRequests, requests.length)
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
    printRequestDetails(selectedRequest)
    return
  }

  const requests = data.requests
  if (requests.length === 0) {
    console.log('No request insights captured yet.')
    return
  }

  const limit = options.limit ?? DEFAULT_REQUEST_LIMIT
  const visibleRequests = requests.slice(-limit).reverse()
  printRequestList(visibleRequests, requests.length)
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
  totalRequests: number
): void {
  console.log(
    `Showing ${visibleRequests.length} of ${totalRequests} retained requests (newest first).`
  )

  for (const request of visibleRequests) {
    const route = request.route ?? request.url ?? request.requestId
    const kind = getRequestInsightKind(request)
    const duration = formatDuration(request.durationMs)
    console.log(
      `${kind === 'instant-insights' ? `Instant Insights · ${route}` : route} ${duration} ${request.status ?? 'pending'}`
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

function findRequest(requests: RequestInsight[], id: string): RequestInsight {
  const exact = requests.find((request) => request.requestId === id)
  if (exact) return exact

  const matches = requests.filter((request) => request.requestId.startsWith(id))
  if (matches.length === 0) {
    return exitWithError(`No retained request matches "${id}".`)
  }
  if (matches.length > 1) {
    return exitWithError(
      `Request ID prefix "${id}" is ambiguous (${matches.length} matches).`
    )
  }
  return matches[0]
}

function printRequestDetails(request: RequestInsight): void {
  const route = request.route ?? request.url ?? request.requestId
  console.log(
    `${route} ${formatDuration(request.durationMs)} ${request.status}`
  )
  console.log(`  request ${request.requestId}`)
  console.log(`  page ${request.htmlRequestId}`)

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

  return exitWithError(
    `Unable to discover a running Next.js dev server from ${lockfilePath}. Start next dev or pass --url.`
  )
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
