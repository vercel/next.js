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
import { getRequestMeta, removeRequestMeta } from '../request-meta'
import { formatArgs } from './server-action-logger'
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
import { getLogStream } from './log-stream'

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
  devRequestTimingInternalsEnd: bigint | undefined,
  devGenerateStaticParamsDuration: bigint | undefined
): void {
  const shouldLog = !ignoreLoggingIncomingRequests(request, loggingConfig)

  // Emit structured log to LogStream (for MCP querying and TUI display).
  // Respects the same logging config as console output.
  if (shouldLog) {
    emitStructuredRequestLog(
      request,
      response.statusCode,
      requestStartTime,
      requestEndTime,
      devRequestTimingMiddlewareStart,
      devRequestTimingMiddlewareEnd,
      devRequestTimingInternalsEnd,
      devGenerateStaticParamsDuration,
      loggingConfig
    )
  }

  // When TUI is active, structured data is sent via IPC (TuiSink) so
  // skip stdout logging to avoid duplicate/poorly-wrapped output.
  if (!process.env.__NEXT_TUI_ENABLED) {
    if (shouldLog) {
      logIncomingRequests(
        request,
        requestStartTime,
        requestEndTime,
        response.statusCode,
        devRequestTimingMiddlewareStart,
        devRequestTimingMiddlewareEnd,
        devRequestTimingInternalsEnd,
        devGenerateStaticParamsDuration
      )

      // Log server action after the request log
      const serverActionLog = getRequestMeta(request, 'devServerActionLog')
      if (serverActionLog) {
        const argsStr = formatArgs(serverActionLog.args)
        process.stdout.write(
          `  └─ ƒ ${serverActionLog.functionName}(${argsStr}) in ${serverActionLog.duration}ms ${dim(serverActionLog.location)}\n`
        )
        removeRequestMeta(request, 'devServerActionLog')
      }
    }

    if (request.fetchMetrics) {
      for (const fetchMetric of request.fetchMetrics) {
        logFetchMetric(fetchMetric, loggingConfig)
      }
    }
  }
}

/** Timing breakdown for request logging */
interface RequestTiming {
  label: string
  time: bigint
}

/**
 * Calculate timing breakdown for a request.
 * Shared by both console logging and structured logging.
 */
function calculateRequestTimings(
  requestStartTime: bigint,
  requestEndTime: bigint,
  devRequestTimingMiddlewareStart: bigint | undefined,
  devRequestTimingMiddlewareEnd: bigint | undefined,
  devRequestTimingInternalsEnd: bigint | undefined,
  devGenerateStaticParamsDuration: bigint | undefined
): RequestTiming[] {
  const timings: RequestTiming[] = []

  let middlewareTime: bigint | undefined
  if (devRequestTimingMiddlewareStart && devRequestTimingMiddlewareEnd) {
    middlewareTime =
      devRequestTimingMiddlewareEnd - devRequestTimingMiddlewareStart
    timings.push({ label: 'middleware', time: middlewareTime })
  }

  if (devRequestTimingInternalsEnd) {
    let frameworkTime = devRequestTimingInternalsEnd - requestStartTime
    // Middleware runs during the internals so we have to subtract it from the framework time
    if (middlewareTime) {
      frameworkTime -= middlewareTime
    }
    // Insert as the first item to be rendered in the list
    timings.unshift({ label: 'compile', time: frameworkTime })

    // Insert after compile, before render based on the execution order
    if (devGenerateStaticParamsDuration) {
      // Pages Router getStaticPaths are technically "generate params" as well
      timings.push({
        label: 'generate-params',
        time: devGenerateStaticParamsDuration,
      })
    }

    timings.push({
      label: 'render',
      time: requestEndTime - devRequestTimingInternalsEnd,
    })
  }

  return timings
}

// Emit a structured request log via LogStream
function emitStructuredRequestLog(
  request: NodeNextRequest,
  statusCode: number,
  requestStartTime: bigint,
  requestEndTime: bigint,
  devRequestTimingMiddlewareStart: bigint | undefined,
  devRequestTimingMiddlewareEnd: bigint | undefined,
  devRequestTimingInternalsEnd: bigint | undefined,
  devGenerateStaticParamsDuration: bigint | undefined,
  loggingConfig: LoggingConfig
): void {
  const isRSC = getRequestMeta(request, 'isRSCRequest')
  const { isFetchAction, actionId } = getServerActionRequestMetadata(request)
  const url = isRSC ? stripNextRscUnionQuery(request.url) : request.url
  const totalRequestTime = requestEndTime - requestStartTime

  // Determine request type: 'action' for server actions, 'nav' for RSC navigations, 'load' for initial loads
  let requestType: 'action' | 'nav' | 'load'
  if (isFetchAction) {
    requestType = 'action'
  } else if (isRSC) {
    requestType = 'nav'
  } else {
    requestType = 'load'
  }

  const timings = calculateRequestTimings(
    requestStartTime,
    requestEndTime,
    devRequestTimingMiddlewareStart,
    devRequestTimingMiddlewareEnd,
    devRequestTimingInternalsEnd,
    devGenerateStaticParamsDuration
  )

  // Convert to milliseconds for structured output
  const timingsMs = timings.map(({ label, time }) => ({
    label,
    time: Number(time / BigInt(1_000_000)),
  }))

  // Collect fetch metrics
  const fetchMetrics: Array<{
    method: string
    url: string
    status: number
    totalTime: number
    cacheStatus?: string
    cacheReason?: string
    cacheWarning?: string
  }> = []

  if (request.fetchMetrics && loggingConfig?.fetches) {
    for (const metric of request.fetchMetrics) {
      if (
        metric.cacheStatus === 'hmr' &&
        !loggingConfig.fetches?.hmrRefreshes
      ) {
        continue
      }
      fetchMetrics.push({
        method: metric.method,
        url: metric.url,
        status: metric.status,
        totalTime: Math.round(metric.end - metric.start),
        cacheStatus: metric.cacheStatus,
        cacheReason: metric.cacheReason,
        cacheWarning: metric.cacheWarning,
      })
    }
  }

  // Get server action info if present
  const serverActionLog = getRequestMeta(request, 'devServerActionLog')
  const serverAction = serverActionLog
    ? {
        functionName: serverActionLog.functionName,
        duration: serverActionLog.duration,
        location: serverActionLog.location,
      }
    : undefined

  // Emit to LogStream (automatically goes to MCP file via sinks)
  const logStream = getLogStream()
  const totalTime = Number(totalRequestTime / BigInt(1_000_000))
  logStream.info(`${request.method} ${url} ${statusCode} in ${totalTime}ms`, {
    scope: 'request',
    structured: {
      type: 'request',
      method: request.method,
      url,
      status: statusCode,
      totalTime,
      requestType,
      actionId: isFetchAction ? actionId : undefined,
      serverAction,
      timings: timingsMs.length > 0 ? timingsMs : undefined,
      fetchMetrics: fetchMetrics.length > 0 ? fetchMetrics : undefined,
    },
  })
}

function logIncomingRequests(
  request: NodeNextRequest,
  requestStartTime: bigint,
  requestEndTime: bigint,
  statusCode: number,
  devRequestTimingMiddlewareStart: bigint | undefined,
  devRequestTimingMiddlewareEnd: bigint | undefined,
  devRequestTimingInternalsEnd: bigint | undefined,
  devGenerateStaticParamsDuration: bigint | undefined
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

  const timings = calculateRequestTimings(
    requestStartTime,
    requestEndTime,
    devRequestTimingMiddlewareStart,
    devRequestTimingMiddlewareEnd,
    devRequestTimingInternalsEnd,
    devGenerateStaticParamsDuration
  )

  // Console logging uses 'proxy.ts' label for middleware (legacy behavior)
  const consoleTimings = timings.map(({ label, time }) => {
    const displayLabel = label === 'middleware' ? 'proxy.ts' : label
    return [displayLabel, time] as [string, bigint]
  })

  return writeLine(
    `${request.method} ${url} ${coloredStatus} in ${hrtimeBigIntDurationToString(totalRequestTime)}${consoleTimings.length > 0 ? dim(` (${consoleTimings.map(([label, time]) => `${label}: ${hrtimeBigIntDurationToString(time)}`).join(', ')})`) : ''}`
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
