import path from 'path'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'
import { getProjectDir } from '../lib/get-project-dir'
import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightResponse,
  RequestInsightSpan,
  RequestInsightsCaptureState,
  RequestInsightsSnapshot,
} from '../next-devtools/shared/request-insights'
import {
  createBoundedRequestInsightsSnapshotProjection,
  getRequestInsightKind,
  getRequestInsightRootId,
  REQUEST_INSIGHT_RETENTION_BUCKETS,
  REQUEST_INSIGHTS_ID_PATTERN,
  REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET,
  REQUEST_INSIGHTS_MAX_ID_LENGTH,
  REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
  REQUEST_INSIGHTS_MIN_GROUPS_PER_RETENTION_BUCKET,
} from '../next-devtools/shared/request-insights'
import {
  escapeTerminalText,
  getUtf8ByteLength,
  stringifyTerminalSafeJson,
} from '../next-devtools/shared/terminal-safe-json'
import loadConfig from '../server/config'
import { printAndExit } from '../server/lib/utils'
import {
  PHASE_DEVELOPMENT_SERVER,
  REQUEST_INSIGHTS_CLEAR_DEV_ENDPOINT,
  REQUEST_INSIGHTS_DEV_ENDPOINT,
} from '../shared/lib/constants'

const DEFAULT_REQUEST_LIMIT = 20
const DEFAULT_FETCH_LIMIT = 5
const DEV_SERVER_DISCOVERY_TIMEOUT_MS = 1000
const DEV_SERVER_DISCOVERY_RETRY_MS = 50
const MAX_DEV_SERVER_URL_LENGTH = 2048
const MAX_REQUEST_INSIGHT_ROUTE_LENGTH = 1024
const MAX_REQUEST_INSIGHT_URL_LENGTH = 2048
const MAX_REQUEST_INSIGHT_LABEL_LENGTH = 256
const MAX_REQUEST_INSIGHT_SPAN_NAME_LENGTH = 8 * 1024

export type NextRequestInsightsOptions = {
  url?: string
  json?: boolean
  limit?: number
  requestId?: string
  htmlRequestId?: string
  captureGroupsPerType?: number
  clear?: boolean
}

export async function nextRequestInsights(
  options: NextRequestInsightsOptions,
  directory?: string
) {
  const query = getSnapshotQuery(options)
  const devServerUrl = options.url
    ? parseDevServerUrl(options.url)
    : await discoverDevServerUrl(directory)

  if (options.captureGroupsPerType !== undefined) {
    const captureGroupsPerType = options.captureGroupsPerType
    if (
      !Number.isSafeInteger(captureGroupsPerType) ||
      captureGroupsPerType < REQUEST_INSIGHTS_MIN_GROUPS_PER_RETENTION_BUCKET ||
      captureGroupsPerType > REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET
    ) {
      exitWithError(
        `Invalid capture group limit ${captureGroupsPerType}. Pass an integer from ${REQUEST_INSIGHTS_MIN_GROUPS_PER_RETENTION_BUCKET} to ${REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET}.`
      )
    }

    const configEndpoint = new URL('/__nextjs_devtools_config', devServerUrl)
    const response = await fetch(configEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestInsights: {
          maxRequestGroupsPerBucket: captureGroupsPerType,
        },
      }),
    }).catch((error) => {
      exitWithRequestError(configEndpoint, error)
    })
    if (!response.ok) {
      exitWithError(`Request failed with ${response.status}`)
    }
  }

  if (options.clear) {
    const clearEndpoint = new URL(
      REQUEST_INSIGHTS_CLEAR_DEV_ENDPOINT,
      devServerUrl
    )
    const response = await fetch(clearEndpoint, { method: 'POST' }).catch(
      (error) => {
        exitWithRequestError(clearEndpoint, error)
      }
    )
    const data = await readJsonResponse(response, clearEndpoint)
    if (!response.ok) {
      exitWithError(getResponseError(data, response.status))
    }
    if (!isRequestInsightsSnapshot(data)) {
      exitWithError(`Invalid response from ${formatEndpoint(clearEndpoint)}.`)
    }
    const serialized = serializeSnapshotForOutput(data, options.json ? 2 : 0)
    if (options.json) {
      console.log(serialized)
    } else {
      console.log('Cleared captured Request Insights data.')
    }
    return
  }

  const endpoint = new URL(REQUEST_INSIGHTS_DEV_ENDPOINT, devServerUrl)
  endpoint.searchParams.set('limit', String(query.limit))
  if (query.requestId !== undefined) {
    endpoint.searchParams.set('requestId', query.requestId)
  }
  if (query.htmlRequestId !== undefined) {
    endpoint.searchParams.set('htmlRequestId', query.htmlRequestId)
  }

  const response = await fetch(endpoint).catch((error) => {
    exitWithRequestError(endpoint, error)
  })
  const data = await readJsonResponse(response, endpoint)

  if (!response.ok) {
    printAndExit(getResponseError(data, response.status), 1)
  }

  if (!isRequestInsightsSnapshot(data)) {
    exitWithError(
      `Invalid response from ${formatEndpoint(endpoint)}: expected a valid Request Insights snapshot.`
    )
  }

  const snapshot = projectSnapshotToLogicalGroups(data, query.limit)
  const serialized = serializeSnapshotForOutput(snapshot, options.json ? 2 : 0)
  if (options.json) {
    console.log(serialized)
    return
  }

  if (options.captureGroupsPerType !== undefined && data.capture) {
    const groupLimit = data.capture.limits.maxRequestGroupsPerBucket
    console.log(
      `Request Insights retains up to ${groupLimit} logical request ${groupLimit === 1 ? 'group' : 'groups'} per type.`
    )
  }

  const requests = snapshot.requests
  if (requests.length === 0) {
    console.log('No request insights captured yet.')
    return
  }

  const visibleGroups = groupRequests(requests).reverse()
  const totalGroupCount =
    visibleGroups.length + (snapshot.projection?.omittedRequestGroupCount ?? 0)
  console.log(
    `Showing ${visibleGroups.length} of ${totalGroupCount} retained logical request groups (newest first).`
  )

  for (const request of visibleGroups.flat()) {
    const route = escapeTerminalText(
      request.route ?? request.url ?? request.requestId
    )
    const kind = getRequestInsightKind(request)
    const duration = formatDuration(request.durationMs)
    console.log(
      `${kind === 'instant-insights' ? `Instant Insights · ${route}` : route} ${duration} ${request.status ?? 'pending'}`
    )
    console.log(
      `  kind ${kind} request ${escapeTerminalText(shortId(request.requestId))} page ${escapeTerminalText(shortId(request.htmlRequestId))}`
    )

    const visibleFetches = request.fetches.slice(0, DEFAULT_FETCH_LIMIT)
    if (visibleFetches.length < request.fetches.length) {
      console.log(
        `  showing first ${visibleFetches.length} of ${request.fetches.length} fetches`
      )
    }

    for (const fetch of visibleFetches) {
      console.log(
        `  fetch ${formatDuration(fetch.durationMs)} ${fetch.statusCode ?? '-'} ${escapeTerminalText(fetch.cacheStatus ?? 'unknown')} ${escapeTerminalText(fetch.method ?? 'GET')} ${escapeTerminalText(fetch.url ?? '')}`
      )
    }
  }
}

function getSnapshotQuery(options: NextRequestInsightsOptions): {
  limit: number
  requestId?: string
  htmlRequestId?: string
} {
  const limit = options.limit ?? DEFAULT_REQUEST_LIMIT
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET
  ) {
    return exitWithError(
      `Invalid request limit ${limit}. Pass an integer from 1 to ${REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET}.`
    )
  }

  validateSnapshotId(options.requestId, 'request ID')
  validateSnapshotId(options.htmlRequestId, 'HTML request ID')
  return {
    limit,
    requestId: options.requestId,
    htmlRequestId: options.htmlRequestId,
  }
}

function validateSnapshotId(value: string | undefined, label: string): void {
  if (
    value !== undefined &&
    (value.length === 0 ||
      value.length > REQUEST_INSIGHTS_MAX_ID_LENGTH ||
      !REQUEST_INSIGHTS_ID_PATTERN.test(value))
  ) {
    exitWithError(
      `Invalid ${label}. Pass 1 to ${REQUEST_INSIGHTS_MAX_ID_LENGTH} letters, numbers, periods, underscores, colons, or hyphens.`
    )
  }
}

export function projectSnapshotToLogicalGroups(
  snapshot: RequestInsightsSnapshot,
  limit: number
): RequestInsightsSnapshot {
  return createBoundedRequestInsightsSnapshotProjection(
    groupRequests(snapshot.requests),
    REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES,
    snapshot.capture,
    limit,
    undefined,
    snapshot.projection
  ).snapshot
}

function groupRequests(requests: readonly RequestInsight[]) {
  const groupsByRootId = new Map<string, RequestInsight[]>()
  for (const request of requests) {
    const rootRequestId = getRequestInsightRootId(request)
    const group = groupsByRootId.get(rootRequestId)
    if (group) {
      group.push(request)
    } else {
      groupsByRootId.set(rootRequestId, [request])
    }
  }
  return Array.from(groupsByRootId.values())
}

async function readJsonResponse(response: Response, endpoint: URL) {
  const text = await readBoundedResponseText(response, endpoint)
  try {
    return JSON.parse(text) as unknown
  } catch {
    return exitWithError(
      `Invalid response from ${formatEndpoint(endpoint)}: ${escapeTerminalText(text.slice(0, 512))}`
    )
  }
}

async function readBoundedResponseText(
  response: Response,
  endpoint: URL
): Promise<string> {
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteLength += value.byteLength
      if (byteLength > REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES) {
        await reader.cancel()
        return exitWithError(
          `Response from ${formatEndpoint(endpoint)} exceeds the ${REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES} byte limit.`
        )
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function exitWithRequestError(endpoint: URL, error: unknown): never {
  return exitWithError(
    `Failed to reach ${formatEndpoint(endpoint)}: ${escapeTerminalText(error instanceof Error ? error.message : String(error))}`
  )
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
    return escapeTerminalText(data.error.slice(0, 512))
  }

  return `Request failed with ${status}`
}

export function isRequestInsightsSnapshot(
  data: unknown
): data is RequestInsightsSnapshot {
  if (!isRecord(data)) return false
  const candidate = data as Partial<RequestInsightsSnapshot>
  return (
    Array.isArray(candidate.requests) &&
    candidate.requests.every(isRequestInsight) &&
    (candidate.capture === undefined ||
      isRequestInsightsCaptureState(candidate.capture)) &&
    (candidate.projection === undefined ||
      isRequestInsightsProjection(candidate.projection))
  )
}

function isRequestInsightsProjection(
  projection: unknown
): projection is NonNullable<RequestInsightsSnapshot['projection']> {
  if (typeof projection !== 'object' || projection === null) return false
  const candidate = projection as NonNullable<
    RequestInsightsSnapshot['projection']
  >
  if (
    !isNonNegativeSafeInteger(candidate.omittedRequestGroupCount) ||
    !Array.isArray(candidate.buckets) ||
    candidate.buckets.length > REQUEST_INSIGHT_RETENTION_BUCKETS.length
  ) {
    return false
  }

  const seenBuckets = new Set<string>()
  let omittedRequestGroupCount = 0
  for (const bucket of candidate.buckets) {
    if (
      typeof bucket !== 'object' ||
      bucket === null ||
      !REQUEST_INSIGHT_RETENTION_BUCKETS.includes(bucket.bucket) ||
      seenBuckets.has(bucket.bucket) ||
      !isNonNegativeSafeInteger(bucket.omittedRequestGroupCount)
    ) {
      return false
    }
    seenBuckets.add(bucket.bucket)
    omittedRequestGroupCount += bucket.omittedRequestGroupCount
    if (!Number.isSafeInteger(omittedRequestGroupCount)) return false
  }
  return omittedRequestGroupCount === candidate.omittedRequestGroupCount
}

function isRequestInsightsCaptureState(
  capture: unknown
): capture is RequestInsightsCaptureState {
  if (!isRecord(capture)) return false
  const candidate = capture as Partial<RequestInsightsCaptureState>
  return (
    isRecord(candidate.limits) &&
    Number.isSafeInteger(candidate.limits.maxRequestGroupsPerBucket) &&
    isRecord(candidate.usage) &&
    Array.isArray(candidate.usage.buckets)
  )
}

function isRequestInsight(request: unknown): request is RequestInsight {
  if (!isRecord(request)) return false
  const candidate = request as Partial<RequestInsight>
  return (
    isBoundedString(candidate.requestId, REQUEST_INSIGHTS_MAX_ID_LENGTH) &&
    isBoundedString(candidate.htmlRequestId, REQUEST_INSIGHTS_MAX_ID_LENGTH) &&
    isOptionalBoundedString(
      candidate.rootRequestId,
      REQUEST_INSIGHTS_MAX_ID_LENGTH
    ) &&
    isOptionalBoundedString(
      candidate.parentRootRequestId,
      REQUEST_INSIGHTS_MAX_ID_LENGTH
    ) &&
    isOptionalNonNegativeSafeInteger(candidate.parentFetchIndex) &&
    isRequestInsightSource(candidate.source) &&
    (candidate.kind === undefined ||
      candidate.kind === 'request' ||
      candidate.kind === 'instant-insights') &&
    isOptionalBoundedString(
      candidate.route,
      MAX_REQUEST_INSIGHT_ROUTE_LENGTH
    ) &&
    isOptionalBoundedString(candidate.url, MAX_REQUEST_INSIGHT_URL_LENGTH) &&
    Number.isFinite(candidate.startTime) &&
    isOptionalFiniteNumber(candidate.durationMs) &&
    (candidate.status === 'ok' ||
      candidate.status === 'error' ||
      candidate.status === 'aborted' ||
      candidate.status === 'pending') &&
    (candidate.response === undefined ||
      isRequestInsightResponse(candidate.response)) &&
    Array.isArray(candidate.spans) &&
    candidate.spans.every(isRequestInsightSpan) &&
    Array.isArray(candidate.fetches) &&
    candidate.fetches.every(isRequestInsightFetch)
  )
}

function isRequestInsightResponse(
  response: unknown
): response is RequestInsightResponse {
  if (!isRecord(response)) return false
  const candidate = response as Partial<RequestInsightResponse>
  return (
    Number.isFinite(candidate.trackingStartTime) &&
    isOptionalFiniteNumber(candidate.endTime) &&
    isOptionalNonNegativeSafeInteger(candidate.statusCode) &&
    (candidate.outcome === 'pending' ||
      candidate.outcome === 'finished' ||
      candidate.outcome === 'aborted' ||
      candidate.outcome === 'errored') &&
    (candidate.error === undefined ||
      (isRecord(candidate.error) &&
        isOptionalBoundedString(
          candidate.error.type,
          MAX_REQUEST_INSIGHT_LABEL_LENGTH
        )))
  )
}

function isRequestInsightSpan(span: unknown): span is RequestInsightSpan {
  if (!isRecord(span)) return false
  const candidate = span as Partial<RequestInsightSpan>
  return (
    isBoundedString(candidate.name, MAX_REQUEST_INSIGHT_SPAN_NAME_LENGTH) &&
    Number.isFinite(candidate.startTime) &&
    isOptionalFiniteNumber(candidate.durationMs) &&
    (candidate.status === undefined ||
      candidate.status === 'ok' ||
      candidate.status === 'error')
  )
}

function isRequestInsightFetch(fetch: unknown): fetch is RequestInsightFetch {
  if (!isRecord(fetch)) return false
  const candidate = fetch as RequestInsightFetch
  return (
    isOptionalBoundedString(candidate.url, MAX_REQUEST_INSIGHT_URL_LENGTH) &&
    isOptionalBoundedString(
      candidate.method,
      MAX_REQUEST_INSIGHT_LABEL_LENGTH
    ) &&
    isOptionalBoundedString(
      candidate.cacheStatus,
      MAX_REQUEST_INSIGHT_LABEL_LENGTH
    ) &&
    isOptionalFiniteNumber(candidate.statusCode) &&
    isOptionalFiniteNumber(candidate.durationMs) &&
    isOptionalNonNegativeSafeInteger(candidate.index)
  )
}

function isRequestInsightSource(
  source: unknown
): source is RequestInsight['source'] {
  return (
    source === 'page' ||
    source === 'app-route' ||
    source === 'pages-api' ||
    source === 'image' ||
    source === 'asset' ||
    source === 'proxy' ||
    source === 'instant-insights' ||
    source === 'unknown'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength
}

function isOptionalBoundedString(
  value: unknown,
  maxLength: number
): value is string | undefined {
  return value === undefined || isBoundedString(value, maxLength)
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  )
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function isOptionalNonNegativeSafeInteger(
  value: unknown
): value is number | undefined {
  return value === undefined || isNonNegativeSafeInteger(value)
}

function formatEndpoint(endpoint: URL): string {
  return escapeTerminalText(endpoint.toString())
}

function parseDevServerUrl(value: string): URL {
  let url: URL

  if (value.length > MAX_DEV_SERVER_URL_LENGTH) {
    return exitWithError(
      'Invalid dev server URL. Pass a valid HTTP or HTTPS URL.'
    )
  }

  try {
    url = new URL(value)
  } catch {
    return exitWithError(
      'Invalid dev server URL. Pass a valid HTTP or HTTPS URL.'
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return exitWithError(
      'Invalid dev server URL. Pass a valid HTTP or HTTPS URL.'
    )
  }

  if (url.username || url.password) {
    return exitWithError(
      'Invalid dev server URL. Credentials are not allowed; pass an HTTP or HTTPS URL without authentication information.'
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

export function serializeSnapshotForOutput(
  snapshot: RequestInsightsSnapshot,
  space: number
): string {
  const compact = stringifyTerminalSafeJson(snapshot)
  if (getUtf8ByteLength(compact) > REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES) {
    return exitWithError(
      `Request Insights output exceeds the terminal-safe ${REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES} byte limit.`
    )
  }

  if (space === 0) {
    return compact
  }

  const formatted = stringifyTerminalSafeJson(snapshot, space)
  return getUtf8ByteLength(formatted) <= REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES
    ? formatted
    : compact
}
