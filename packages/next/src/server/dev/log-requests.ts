import {
  blue,
  bold,
  gray,
  green,
  red,
  white,
  yellow,
} from '../../lib/picocolors'
import { stripNextRscUnionQuery } from '../../lib/url'
import type { FetchMetric } from '../base-http'
import type { NodeNextRequest, NodeNextResponse } from '../base-http/node'
import type { LoggingConfig } from '../config-shared'
import { getRequestMeta } from '../request-meta'

export interface RequestLoggingOptions {
  readonly request: NodeNextRequest
  readonly response: NodeNextResponse
  readonly loggingConfig: LoggingConfig | undefined
  readonly requestDurationInMs: number
}

export function logRequests(options: RequestLoggingOptions): void {
  const { request, response, loggingConfig, requestDurationInMs } = options

  logIncomingRequest({
    request,
    requestDurationInMs,
    statusCode: response.statusCode,
  })

  if (request.fetchMetrics) {
    for (const fetchMetric of request.fetchMetrics) {
      logFetchMetric(fetchMetric, loggingConfig)
    }
  }
}

interface IncomingRequestOptions {
  readonly request: NodeNextRequest
  readonly requestDurationInMs: number
  readonly statusCode: number
}

function logIncomingRequest(options: IncomingRequestOptions): void {
  const { request, requestDurationInMs, statusCode } = options
  const isRSC = getRequestMeta(request, 'isRSCRequest')
  const url = isRSC ? stripNextRscUnionQuery(request.url) : request.url

  const statusCodeColor =
    statusCode < 200
      ? white
      : statusCode < 300
        ? green
        : statusCode < 400
          ? blue
          : statusCode < 500
            ? yellow
            : red

  const coloredStatus = statusCodeColor(statusCode.toString())

  return writeLine(
    `${request.method} ${url} ${coloredStatus} in ${requestDurationInMs}ms`
  )
}

function logFetchMetric(
  fetchMetric: FetchMetric,
  loggingConfig: LoggingConfig | undefined
): void {
  let {
    cacheReason,
    cacheStatus,
    cacheWarning,
    end,
    method,
    start,
    status,
    url,
  } = fetchMetric

  if (cacheStatus === 'hmr' && !loggingConfig?.fetches?.hmrRefreshes) {
    // Cache hits during HMR refreshes are intentionally not logged, unless
    // explicitly enabled in the logging config.
    return
  }

  if (loggingConfig?.fetches) {
    if (url.length > 48 && !loggingConfig.fetches.fullUrl) {
      url = truncateUrl(url)
    }

    writeLine(
      white(
        `${method} ${url} ${status} in ${Math.round(end - start)}ms ${formatCacheStatus(cacheStatus)}`
      ),
      1
    )

    if (cacheStatus === 'skip' || cacheStatus === 'miss') {
      writeLine(
        gray(
          `Cache ${cacheStatus === 'skip' ? 'skipped' : 'missed'} reason: (${white(cacheReason)})`
        ),
        2
      )
    }
  } else if (cacheWarning) {
    // When logging for fetches is not enabled, we still want to print any
    // associated warnings, so we print the request first to provide context.
    writeLine(white(`${method} ${url}`), 1)
  }

  if (cacheWarning) {
    writeLine(`${yellow(bold('⚠'))} ${white(cacheWarning)}`, 2)
  }
}

function writeLine(text: string, indentationLevel = 0): void {
  process.stdout.write(` ${'│ '.repeat(indentationLevel)}${text}\n`)
}

function truncate(text: string, maxLength: number): string {
  return maxLength !== undefined && text.length > maxLength
    ? text.substring(0, maxLength) + '..'
    : text
}

function truncateUrl(url: string): string {
  const { protocol, host, pathname, search } = new URL(url)

  return (
    protocol +
    '//' +
    truncate(host, 16) +
    truncate(pathname, 24) +
    truncate(search, 16)
  )
}

function formatCacheStatus(cacheStatus: FetchMetric['cacheStatus']): string {
  switch (cacheStatus) {
    case 'hmr':
      return green('(HMR cache)')
    case 'hit':
      return green('(cache hit)')
    default:
      return yellow(`(cache ${cacheStatus})`)
  }
}
