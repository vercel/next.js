import { useMemo, useState } from 'react'
import { Menu } from '@base-ui-components/react/menu'
import {
  getRequestInsightKey,
  getRequestInsightKind,
  type RequestInsight,
  type RequestInsightFetch,
} from '../../../shared/request-insights'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { ACTION_DEVTOOLS_CONFIG } from '../../shared'
import { saveDevToolsConfig } from '../../utils/save-devtools-config'
import { CopyButton } from '../copy-button'
import GearIcon from '../../icons/gear-icon'
import { formatDuration } from './format-duration'
import {
  getActiveRequestKey,
  getRequestListEntries,
  isInternalRequestInsight,
  isPageLoadRequest,
} from './request-list'
import {
  getTraceItems,
  getTracePosition,
  getTraceRange,
  type TraceItem,
} from './trace-viewer'
import './request-insights-panel.css'

const TRACE_TICK_COUNT = 5

export function RequestInsightsPanel() {
  const { dispatch, state, shadowRoot } = useDevOverlayContext()
  const requests = useMemo(
    () => [...state.requestInsights].reverse(),
    [state.requestInsights]
  )
  const { showInternal, verbose } = state.requestInsightsConfig
  const setRequestInsightsConfig = (patch: {
    showInternal?: boolean
    verbose?: boolean
  }) => {
    dispatch({
      type: ACTION_DEVTOOLS_CONFIG,
      devToolsConfig: { requestInsights: patch },
    })
    saveDevToolsConfig({ requestInsights: patch })
  }
  const listEntries = useMemo(
    () => getRequestListEntries(requests, showInternal),
    [requests, showInternal]
  )
  const visibleRequests = useMemo(
    () => listEntries.map((entry) => entry.request),
    [listEntries]
  )
  const [selectedRequestKey, setSelectedRequestKey] = useState<string | null>(
    () => getActiveRequestKey(visibleRequests, null)
  )
  const activeRequestKey = getActiveRequestKey(
    visibleRequests,
    selectedRequestKey
  )
  const selectedRequest =
    visibleRequests.find(
      (request) => getRequestInsightKey(request) === activeRequestKey
    ) ?? null
  const initialRequestId = self.__next_r
  const internalRequests = useMemo(
    () => requests.filter((request) => isInternalRequestInsight(request)),
    [requests]
  )
  const hiddenInternalErrorCount = showInternal
    ? 0
    : internalRequests.filter((request) => request.status === 'error').length
  // Only offer the internal-activity toggle once the session has captured
  // internal activity to reveal.
  const showInternalToggle = internalRequests.length > 0

  if (requests.length === 0) {
    return (
      <div className="request-insights-empty">
        Request insights will appear after the next App Router request.
      </div>
    )
  }

  return (
    <div className="request-insights-panel">
      <div className="request-insights-list">
        <div className="request-insights-list-toolbar">
          <strong>Requests</strong>
          <div className="request-insights-settings">
            {hiddenInternalErrorCount > 0 ? (
              <span
                aria-label={`${hiddenInternalErrorCount} hidden internal error${hiddenInternalErrorCount === 1 ? '' : 's'}`}
                className="request-insights-settings-dot"
                role="img"
              />
            ) : null}
            <Menu.Root delay={0} modal={false}>
              <Menu.Trigger
                aria-label="Request list settings"
                className="request-insights-settings-trigger"
              >
                <GearIcon />
              </Menu.Trigger>
              <Menu.Portal container={shadowRoot}>
                <Menu.Positioner
                  align="end"
                  className="request-insights-settings-positioner"
                  side="bottom"
                  sideOffset={4}
                >
                  <Menu.Popup className="request-insights-settings-menu">
                    {showInternalToggle ? (
                      <Menu.CheckboxItem
                        checked={showInternal}
                        className="request-insights-settings-item"
                        closeOnClick={false}
                        onCheckedChange={(checked) =>
                          setRequestInsightsConfig({ showInternal: checked })
                        }
                      >
                        <span
                          className="request-insights-settings-checkbox"
                          data-checked={showInternal || undefined}
                        >
                          {showInternal ? <CheckIcon /> : null}
                        </span>
                        Internal activity
                      </Menu.CheckboxItem>
                    ) : null}
                    <Menu.CheckboxItem
                      checked={verbose}
                      className="request-insights-settings-item"
                      closeOnClick={false}
                      onCheckedChange={(checked) =>
                        setRequestInsightsConfig({ verbose: checked })
                      }
                    >
                      <span
                        className="request-insights-settings-checkbox"
                        data-checked={verbose || undefined}
                      >
                        {verbose ? <CheckIcon /> : null}
                      </span>
                      Verbose traces
                    </Menu.CheckboxItem>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        </div>
        {listEntries.length === 0 ? (
          <div className="request-insights-list-empty">
            Only internal activity has been captured. Enable “Internal activity”
            to view it.
          </div>
        ) : (
          listEntries.map(({ request, nested }) => {
            const requestKey = getRequestInsightKey(request)
            return (
              <RequestRow
                key={requestKey}
                nested={nested}
                request={request}
                pageLoad={isPageLoadRequest(request, initialRequestId)}
                selected={requestKey === activeRequestKey}
                onSelect={() => setSelectedRequestKey(requestKey)}
              />
            )
          })
        )}
      </div>

      {selectedRequest && (
        <RequestDetails request={selectedRequest} verbose={verbose} />
      )}
    </div>
  )
}

function RequestRow({
  request,
  nested,
  pageLoad,
  selected,
  onSelect,
}: {
  request: RequestInsight
  nested: boolean
  pageLoad: boolean
  selected: boolean
  onSelect: () => void
}) {
  const isInstantInsights =
    getRequestInsightKind(request) === 'instant-insights'
  const route = request.route ?? request.url ?? 'Unknown route'

  return (
    <button
      className="request-insights-row"
      data-internal={isInstantInsights || undefined}
      data-nested={nested || undefined}
      data-page-load={pageLoad}
      data-selected={selected}
      onClick={onSelect}
      type="button"
    >
      <span className="request-insights-status" data-status={request.status} />
      <span className="request-insights-route">
        {nested ? <NestedArrowIcon /> : null}
        {isInstantInsights && !nested ? (
          <span className="request-insights-internal-badge">Internal</span>
        ) : null}
        <span className="request-insights-route-label">
          {isInstantInsights ? 'Instant Insights' : route}
        </span>
        {isInstantInsights && !nested ? (
          <span className="request-insights-item-context">{route}</span>
        ) : pageLoad ? (
          <span className="request-insights-page-load">Page load</span>
        ) : null}
      </span>
      <span className="request-insights-duration">
        {formatDuration(request.durationMs)}
      </span>
      <span className="request-insights-meta">
        {formatClockTime(request.startTime)}
      </span>
      <span className="request-insights-meta request-insights-fetch-summary">
        {request.fetches.length
          ? `${request.fetches.length} fetch${request.fetches.length === 1 ? '' : 'es'}`
          : 'No fetches'}
      </span>
    </button>
  )
}

function NestedArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="request-insights-nested-arrow"
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width="12"
    >
      <path d="M4 3v5.5A2.5 2.5 0 0 0 6.5 11H12M12 11l-3-3m3 3-3 3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height="12"
      viewBox="0 0 16 16"
      width="12"
    >
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
    </svg>
  )
}

function RequestDetails({
  request,
  verbose,
}: {
  request: RequestInsight
  verbose: boolean
}) {
  const traceItems = useMemo(
    () => getTraceItems(request, verbose),
    [request, verbose]
  )
  const overview = useMemo(() => getRequestOverview(request), [request])
  const diagnosis = getDiagnosis(request, traceItems)

  return (
    <div className="request-insights-details">
      <div className="request-insights-summary">
        <div className="request-insights-heading">
          <div className="request-insights-title-row">
            <div className="request-insights-title">
              {getRequestInsightKind(request) === 'instant-insights'
                ? `Instant Insights · ${request.route ?? request.url ?? request.requestId}`
                : (request.route ?? request.url ?? request.requestId)}
            </div>
            <CopyButton
              actionLabel="Copy request JSON"
              className="request-insights-copy"
              content={JSON.stringify(request, null, 2)}
              successLabel="Copied request JSON"
            />
          </div>
        </div>
        <div className="request-insights-total">
          {formatDuration(request.durationMs)}
        </div>
      </div>

      <RequestOverview overview={overview} />
      {overview.errorSummary ? (
        <div className="request-insights-error">{overview.errorSummary}</div>
      ) : null}
      <div className="request-insights-diagnosis">{diagnosis}</div>

      <Trace items={traceItems} request={request} />

      <FetchTable fetches={request.fetches} />
    </div>
  )
}

function RequestOverview({
  overview,
}: {
  overview: ReturnType<typeof getRequestOverview>
}) {
  return (
    <div className="request-insights-overview">
      {overview.method ? <span>Method {overview.method}</span> : null}
      <span>Status {overview.statusLabel}</span>
      <span>{overview.kind}</span>
      <span>{overview.fetchSummary}</span>
      <span>{overview.cacheSummary}</span>
      <span>{overview.spanSummary}</span>
    </div>
  )
}

function Trace({
  request,
  items,
}: {
  request: RequestInsight
  items: TraceItem[]
}) {
  const range = getTraceRange(request)
  const ticks = Array.from({ length: TRACE_TICK_COUNT }, (_, index) => {
    const position = index / (TRACE_TICK_COUNT - 1)
    return {
      label: formatDuration(range.durationMs * position),
      position: position * 100,
    }
  })

  return (
    <div className="request-insights-section">
      <div className="request-insights-section-heading">
        <div className="request-insights-section-title">Trace</div>
        <div className="request-insights-section-note">
          {items.length} span{items.length === 1 ? '' : 's'} ·{' '}
          {formatDuration(range.durationMs)}
        </div>
      </div>
      <div className="request-insights-trace-viewport">
        <div className="request-insights-trace">
          <div className="request-insights-trace-header">
            <span>Span</span>
            <span className="request-insights-trace-axis">
              {ticks.map((tick, index) => (
                <span
                  className="request-insights-trace-tick"
                  data-edge={
                    index === 0
                      ? 'start'
                      : index === ticks.length - 1
                        ? 'end'
                        : undefined
                  }
                  key={tick.position}
                  style={{ left: `${tick.position}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </span>
            <span className="request-insights-trace-duration-heading">
              Duration
            </span>
          </div>
          <div className="request-insights-trace-rows">
            {items.map((item) => {
              const position = getTracePosition(item, range)

              return (
                <div
                  className="request-insights-span-row"
                  data-kind={item.kind}
                  key={item.id}
                  title={`${item.label} · +${formatDuration(position.offsetMs)} · ${formatDuration(item.durationMs)}`}
                >
                  <span
                    className="request-insights-span-name"
                    style={{ paddingLeft: `${item.depth * 14 + 4}px` }}
                  >
                    <span className="request-insights-span-label">
                      <span
                        className="request-insights-span-marker"
                        data-kind={item.kind}
                        data-status={item.status}
                      />
                      <span>{item.label}</span>
                    </span>
                  </span>
                  <span className="request-insights-span-track">
                    <span
                      className="request-insights-span-bar"
                      data-status={item.status}
                      style={{
                        left: `${position.left}%`,
                        width: `${position.width}%`,
                      }}
                    />
                  </span>
                  <span className="request-insights-span-duration">
                    {formatDuration(item.durationMs)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function FetchTable({ fetches }: { fetches: RequestInsightFetch[] }) {
  return (
    <div className="request-insights-section">
      <div className="request-insights-section-title">Fetches</div>
      {fetches.length === 0 ? (
        <div className="request-insights-muted">
          No server fetches captured.
        </div>
      ) : (
        <div className="request-insights-fetch-table">
          <div className="request-insights-fetch request-insights-fetch-header">
            <span>Method</span>
            <span>URL</span>
            <span>Duration</span>
            <span>Status</span>
            <span>Cache</span>
            <span>Reason</span>
          </div>
          {fetches.map((fetch, index) => {
            const urlParts = formatUrl(fetch.url)
            return (
              <div className="request-insights-fetch" key={index}>
                <span className="request-insights-method">
                  {fetch.method ?? 'GET'}
                </span>
                <span className="request-insights-fetch-url">
                  <span>{urlParts.path}</span>
                  {urlParts.host ? (
                    <span className="request-insights-fetch-host">
                      {urlParts.host}
                    </span>
                  ) : null}
                </span>
                <span>{formatDuration(fetch.durationMs)}</span>
                <span>{fetch.statusCode ?? '-'}</span>
                <span>{fetch.cacheStatus ?? 'unknown'}</span>
                <span className="request-insights-cache-reason">
                  {fetch.cacheReason ?? '-'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function getRequestOverview(request: RequestInsight) {
  const isInstantInsights =
    getRequestInsightKind(request) === 'instant-insights'
  const method = isInstantInsights
    ? undefined
    : (getFirstStringAttribute(request, 'http.method') ??
      getMethodFromName(request.spans[0]?.name) ??
      'GET')
  const statusCode = getFirstNumberAttribute(request, 'http.status_code')
  const isRsc = getFirstBooleanAttribute(request, 'next.rsc')
  const erroredSpan = request.spans.find(
    (span) => span.status === 'error' || span.error
  )
  const errorSummary = erroredSpan
    ? `${erroredSpan.name}: ${erroredSpan.error?.message ?? erroredSpan.error?.type ?? 'error'}`
    : undefined
  const cacheCounts = request.fetches.reduce(
    (counts, fetch) => {
      if (fetch.cacheStatus === 'hit') counts.hit += 1
      else if (fetch.cacheStatus === 'miss') counts.miss += 1
      else if (fetch.cacheStatus === 'skip') counts.skip += 1
      else counts.unknown += 1
      return counts
    },
    { hit: 0, miss: 0, skip: 0, unknown: 0 }
  )
  const knownCacheCount = cacheCounts.hit + cacheCounts.miss + cacheCounts.skip

  return {
    method,
    statusCode,
    statusLabel: statusCode ?? request.status,
    kind: isInstantInsights
      ? 'Instant Insights'
      : isRsc
        ? 'RSC request'
        : 'HTML request',
    fetchSummary: request.fetches.length
      ? `${request.fetches.length} fetch${request.fetches.length === 1 ? '' : 'es'}`
      : 'No fetches',
    cacheSummary:
      request.fetches.length === 0
        ? 'No cache data'
        : knownCacheCount === 0
          ? 'Cache status unknown'
          : `Cache ${cacheCounts.hit} hit, ${cacheCounts.miss} miss, ${cacheCounts.skip} skip${
              cacheCounts.unknown ? `, ${cacheCounts.unknown} unknown` : ''
            }`,
    spanSummary: `${request.spans.length} span${request.spans.length === 1 ? '' : 's'}`,
    errorSummary,
  }
}

function getDiagnosis(
  request: RequestInsight,
  traceItems: TraceItem[]
): string {
  const nestedItems = traceItems.filter((item) => item.depth > 0)
  const criticalItem = (
    nestedItems.length > 0 ? nestedItems : traceItems
  ).reduce<TraceItem | null>((largest, item) => {
    if (!largest || (item.durationMs ?? 0) > (largest.durationMs ?? 0)) {
      return item
    }
    return largest
  }, null)
  const slowestFetch = request.fetches.reduce<RequestInsightFetch | null>(
    (slowest, fetch) => {
      if (!slowest || (fetch.durationMs ?? 0) > (slowest.durationMs ?? 0)) {
        return fetch
      }
      return slowest
    },
    null
  )

  if (
    slowestFetch &&
    (!criticalItem ||
      (slowestFetch.durationMs ?? 0) >= (criticalItem.durationMs ?? 0))
  ) {
    const urlParts = formatUrl(slowestFetch.url)
    return `Slowest recorded operation: ${urlParts.path} · ${formatDuration(slowestFetch.durationMs)}${getCacheSummary(slowestFetch)}.`
  }

  if (criticalItem) {
    return `Slowest recorded operation: ${criticalItem.label} · ${formatDuration(criticalItem.durationMs)}.`
  }

  return 'No slow server work was captured for this request.'
}

function getCacheSummary(fetch: RequestInsightFetch): string {
  if (!fetch.cacheStatus) {
    return ''
  }

  const reason = fetch.cacheReason ? `, ${fetch.cacheReason}` : ''
  return ` (${fetch.cacheStatus}${reason})`
}

function getFirstStringAttribute(
  request: RequestInsight,
  key: string
): string | undefined {
  for (const span of request.spans) {
    const value = span.attributes?.[key]
    if (typeof value === 'string') {
      return value
    }
  }
}

function getFirstNumberAttribute(
  request: RequestInsight,
  key: string
): number | undefined {
  for (const span of request.spans) {
    const value = span.attributes?.[key]
    if (typeof value === 'number') {
      return value
    }
  }
}

function getFirstBooleanAttribute(
  request: RequestInsight,
  key: string
): boolean | undefined {
  for (const span of request.spans) {
    const value = span.attributes?.[key]
    if (typeof value === 'boolean') {
      return value
    }
  }
}

function getMethodFromName(name: string | undefined): string | undefined {
  const match = name?.match(
    /^(?:RSC )?(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/
  )
  return match?.[1]
}

function formatUrl(url: string | undefined): { path: string; host?: string } {
  if (!url) {
    return { path: 'Unknown URL' }
  }

  try {
    const parsedUrl = new URL(url, window.location.origin)
    const path = `${parsedUrl.pathname}${parsedUrl.search}`
    const sameHost = parsedUrl.host === window.location.host
    return {
      path,
      host: sameHost ? undefined : parsedUrl.host,
    }
  } catch {
    return { path: url }
  }
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
