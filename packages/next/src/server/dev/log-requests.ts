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
import { getServerActionRequestMetadata } from '../lib/server-action-request-meta'
import { traceGlobals } from '../../trace/shared'
import { join } from 'path'
import { readFileSync } from 'fs'

// Cache the manifest to avoid reading it on every request
let actionManifestCache: {
  node: Record<string, { filename: string; exportedName: string }>
  edge: Record<string, { filename: string; exportedName: string }>
} | null = null
let actionManifestMtime: number = 0

interface ActionInfo {
  name: string
  file?: string
}

function getActionInfo(actionId: string | null): ActionInfo | undefined {
  if (!actionId) return undefined

  const distDir = traceGlobals.get('distDir')
  if (!distDir) return undefined

  try {
    const manifestPath = join(
      distDir,
      'server',
      'server-reference-manifest.json'
    )
    const stat = (require('fs') as typeof import('fs')).statSync(manifestPath)

    // Reload manifest if it changed
    if (!actionManifestCache || stat.mtimeMs !== actionManifestMtime) {
      actionManifestCache = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      actionManifestMtime = stat.mtimeMs
    }

    const entry =
      actionManifestCache?.node?.[actionId] ||
      actionManifestCache?.edge?.[actionId]

    if (entry) {
      const exportedName = entry.exportedName
      // Inline actions have names like $$RSC_SERVER_ACTION_0
      const name = exportedName.startsWith('$$RSC_SERVER_ACTION_')
        ? 'inline action'
        : exportedName

      // Clean up the filename (remove leading ./ or app/ prefix for brevity)
      let file = entry.filename
      if (file) {
        file = file.replace(/^\.\//, '').replace(/^app\//, '')
      }

      return { name, file }
    }
  } catch {
    // Manifest not available yet or error reading
  }

  return undefined
}

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
  // For TUI: send structured data with fetch metrics bundled
  if (process.env.__NEXT_TUI_ENABLED && process.send) {
    sendStructuredRequestLog(
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
    return // Skip regular logging for TUI
  }

  if (!ignoreLoggingIncomingRequests(request, loggingConfig)) {
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
  }

  if (request.fetchMetrics) {
    for (const fetchMetric of request.fetchMetrics) {
      logFetchMetric(fetchMetric, loggingConfig)
    }
  }
}

// Send a complete request log with all fetch metrics to TUI
function sendStructuredRequestLog(
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

  const timings: Array<{ label: string; time: number }> = []

  let middlewareTime: bigint | undefined
  if (devRequestTimingMiddlewareStart && devRequestTimingMiddlewareEnd) {
    middlewareTime =
      devRequestTimingMiddlewareEnd - devRequestTimingMiddlewareStart
    timings.push([
      'proxy.ts',
      Number(middlewareTime / BigInt(1_000_000)),
    ] as any)
  }

  if (devRequestTimingInternalsEnd) {
    let frameworkTime = devRequestTimingInternalsEnd - requestStartTime
    if (middlewareTime) {
      frameworkTime -= middlewareTime
    }
    timings.unshift({
      label: 'compile',
      time: Number(frameworkTime / BigInt(1_000_000)),
    })

    if (devGenerateStaticParamsDuration) {
      timings.push({
        label: 'generate-params',
        time: Number(devGenerateStaticParamsDuration / BigInt(1_000_000)),
      })
    }

    timings.push({
      label: 'render',
      time: Number(
        (requestEndTime - devRequestTimingInternalsEnd) / BigInt(1_000_000)
      ),
    })
  }

  // Fix the proxy.ts timing entry format
  const fixedTimings = timings.map((t) =>
    Array.isArray(t) ? { label: t[0], time: t[1] } : t
  )

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

  // Look up action info from manifest if this is an action
  const actionInfo = isFetchAction ? getActionInfo(actionId) : undefined

  process.send?.({
    tuiMessage: {
      type: 'structured-log',
      payload: {
        type: 'request',
        method: request.method,
        url,
        status: statusCode,
        totalTime: Number(totalRequestTime / BigInt(1_000_000)),
        requestType,
        actionId: isFetchAction ? actionId : undefined,
        actionName: actionInfo?.name,
        actionFile: actionInfo?.file,
        timings: fixedTimings,
        fetchMetrics: fetchMetrics.length > 0 ? fetchMetrics : undefined,
      },
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

    // Insert after compile, before render based on the execution order.
    if (devGenerateStaticParamsDuration) {
      // Pages Router getStaticPaths are technically "generate params" as well.
      times.push(['generate-params', devGenerateStaticParamsDuration])
    }

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
  // Skip writing to stdout when TUI is enabled (use IPC instead)
  if (process.env.__NEXT_TUI_ENABLED) {
    return
  }
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
