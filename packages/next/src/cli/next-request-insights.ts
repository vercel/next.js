import path from 'path'
import { readLockfileContent, parseDevServerInfo } from '../build/lockfile'
import { getProjectDir } from '../lib/get-project-dir'
import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightsCaptureState,
  RequestInsightsSnapshot,
} from '../next-devtools/shared/request-insights'
import { getRequestInsightKind } from '../next-devtools/shared/request-insights'
import {
  REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET,
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
const MAX_REQUEST_INSIGHT_ID_LENGTH = 128
const MAX_REQUEST_INSIGHT_ROUTE_LENGTH = 1024
const MAX_REQUEST_INSIGHT_URL_LENGTH = 2048
const MAX_REQUEST_INSIGHT_LABEL_LENGTH = 256

export type NextRequestInsightsOptions = {
  url?: string
  json?: boolean
  limit?: number
  captureGroupsPerType?: number
  clear?: boolean
}

export async function nextRequestInsights(
  options: NextRequestInsightsOptions,
  directory?: string
) {
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

  const serialized = serializeSnapshotForOutput(data, options.json ? 2 : 0)
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

  const requests = data.requests
  if (requests.length === 0) {
    console.log('No request insights captured yet.')
    return
  }

  const limit = options.limit ?? DEFAULT_REQUEST_LIMIT
  const visibleRequests = requests.slice(-limit).reverse()
  console.log(
    `Showing ${visibleRequests.length} of ${requests.length} retained requests (newest first).`
  )

  for (const request of visibleRequests) {
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

function isRequestInsightsSnapshot(
  data: unknown
): data is RequestInsightsSnapshot {
  if (typeof data !== 'object' || data === null) return false
  const candidate = data as Partial<RequestInsightsSnapshot>
  return (
    Array.isArray(candidate.requests) &&
    candidate.requests.every(isRequestInsight) &&
    (candidate.capture === undefined ||
      isRequestInsightsCaptureState(candidate.capture))
  )
}

function isRequestInsightsCaptureState(
  capture: unknown
): capture is RequestInsightsCaptureState {
  if (typeof capture !== 'object' || capture === null) return false
  const candidate = capture as Partial<RequestInsightsCaptureState>
  return (
    typeof candidate.limits === 'object' &&
    candidate.limits !== null &&
    Number.isSafeInteger(candidate.limits.maxRequestGroupsPerBucket)
  )
}

function isRequestInsight(request: unknown): request is RequestInsight {
  if (typeof request !== 'object' || request === null) return false
  const candidate = request as Partial<RequestInsight>
  return (
    isBoundedString(candidate.requestId, MAX_REQUEST_INSIGHT_ID_LENGTH) &&
    isBoundedString(candidate.htmlRequestId, MAX_REQUEST_INSIGHT_ID_LENGTH) &&
    isOptionalBoundedString(
      candidate.rootRequestId,
      MAX_REQUEST_INSIGHT_ID_LENGTH
    ) &&
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
      candidate.status === 'pending') &&
    Array.isArray(candidate.spans) &&
    Array.isArray(candidate.fetches) &&
    candidate.fetches.every(isRequestInsightFetch)
  )
}

function isRequestInsightFetch(fetch: unknown): fetch is RequestInsightFetch {
  if (typeof fetch !== 'object' || fetch === null) return false
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
    isOptionalFiniteNumber(candidate.durationMs)
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

function serializeSnapshotForOutput(
  snapshot: RequestInsightsSnapshot,
  space: number
): string {
  const serialized = stringifyTerminalSafeJson(snapshot, space)
  if (getUtf8ByteLength(serialized) > REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES) {
    return exitWithError(
      `Request Insights output exceeds the terminal-safe ${REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES} byte limit.`
    )
  }
  return serialized
}
