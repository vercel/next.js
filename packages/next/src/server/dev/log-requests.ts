import { hrtimeBigIntDurationToString } from '../../build/duration-to-string'
import {
  blue,
  bold,
  gray,
  green,
  red,
  white,
  yellow,
  dim,
} from '../../lib/picocolors'
import { stripNextRscUnionQuery } from '../../lib/url'
import type { FetchMetric } from '../base-http'
import type { NodeNextRequest, NodeNextResponse } from '../base-http/node'
import type { LoggingConfig } from '../config-shared'
import { getRequestMeta } from '../request-meta'

/**
 * Returns true if the incoming request should be ignored for logging.
 */
export function ignoreLoggingIncomingRequests(
  request: NodeNextRequest,
  loggingConfig: LoggingConfig | undefined
): boolean {
  // If it's boolean use the boolean value
  if (typeof loggingConfig?.incomingRequests === 'boolean') {
    return !loggingConfig.incomingRequests
  }

  // Any of the value on the chain is falsy, will not ignore the request.
  const ignore = loggingConfig?.incomingRequests?.ignore

  // If ignore is not set, don't ignore anything
  if (!ignore) {
    return false
  }

  // If array of RegExp, ignore if any pattern matches
  return ignore.some((pattern) => pattern.test(request.url))
}

export function logRequests(
  request: NodeNextRequest,
  response: NodeNextResponse,
  loggingConfig: LoggingConfig,
  requestStartTime: bigint,
  requestEndTime: bigint,
  devRequestTimingMiddlewareStart: bigint | undefined,
  devRequestTimingMiddlewareEnd: bigint | undefined,
  devRequestTimingInternalsEnd: bigint | undefined
): void {
  if (!ignoreLoggingIncomingRequests(request, loggingConfig)) {
    logIncomingRequests(
      request,
      requestStartTime,
      requestEndTime,
      response.statusCode,
      devRequestTimingMiddlewareStart,
      devRequestTimingMiddlewareEnd,
      devRequestTimingInternalsEnd
    )
  }

  if (request.fetchMetrics) {
    for (const fetchMetric of request.fetchMetrics) {
      logFetchMetric(fetchMetric, loggingConfig)
    }
  }
}

function logIncomingRequests(
  request: NodeNextRequest,
  requestStartTime: bigint,
  requestEndTime: bigint,
  statusCode: number,
  devRequestTimingMiddlewareStart: bigint | undefined,
  devRequestTimingMiddlewareEnd: bigint | undefined,
  devRequestTimingInternalsEnd: bigint | undefined
): void {
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

  const totalRequestTime = requestEndTime - requestStartTime

  const times: Array<[label: string, time: bigint]> = []

  let middlewareTime: bigint | undefined
  if (devRequestTimingMiddlewareStart && devRequestTimingMiddlewareEnd) {
    middlewareTime =
      devRequestTimingMiddlewareEnd - devRequestTimingMiddlewareStart
    times.push(['proxy.ts', middlewareTime])
  }

  if (devRequestTimingInternalsEnd) {
    let frameworkTime = devRequestTimingInternalsEnd - requestStartTime

    /* Middleware runs during the internals so we have to subtract it from the framework time */
    if (middlewareTime) {
      frameworkTime -= middlewareTime
    }
    // Insert as the first item to be rendered in the list
    times.unshift(['compile', frameworkTime])
    times.push(['render', requestEndTime - devRequestTimingInternalsEnd])
  }

  return writeLine(
    `${request.method} ${url} ${coloredStatus} in ${hrtimeBigIntDurationToString(totalRequestTime)}${times.length > 0 ? dim(` (${times.map(([label, time]) => `${label}: ${hrtimeBigIntDurationToString(time)}`).join(', ')})`) : ''}`
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
    case 'miss':
    case 'skip':
      return yellow(`(cache ${cacheStatus})`)
    default:
      return cacheStatus satisfies never
  }
}
