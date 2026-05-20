import { useMemo, useState } from 'react'
import type {
  RequestInsight,
  RequestInsightFetch,
  RequestInsightSpan,
} from '../../../shared/request-insights'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { CopyButton } from '../copy-button'
import './request-insights-panel.css'

type TimelinePhase = 'Framework' | 'Render' | 'Fetches' | 'Response'

type TimelineItem = {
  id: string
  phase: TimelinePhase
  label: string
  detail?: string
  startTime: number
  durationMs?: number
  status: 'ok' | 'error' | 'pending'
  kind: 'span' | 'fetch'
  cacheReason?: string
  isCritical: boolean
}

const PHASES: TimelinePhase[] = ['Framework', 'Render', 'Fetches', 'Response']
const FOCUSED_MIN_FRAMEWORK_DURATION_MS = 1

export function RequestInsightsPanel() {
  const { state } = useDevOverlayContext()
  const requests = useMemo(
    () => [...state.requestInsights].reverse(),
    [state.requestInsights]
  )
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  )
  const defaultRequest =
    requests.find((request) => request.fetches.length > 0) ??
    requests[0] ??
    null
  const selectedRequest =
    requests.find((request) => request.requestId === selectedRequestId) ??
    defaultRequest

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
        {requests.map((request) => (
          <RequestRow
            key={request.requestId}
            request={request}
            selected={request.requestId === selectedRequest?.requestId}
            onSelect={() => setSelectedRequestId(request.requestId)}
          />
        ))}
      </div>

      {selectedRequest && <RequestDetails request={selectedRequest} />}
    </div>
  )
}

function RequestRow({
  request,
  selected,
  onSelect,
}: {
  request: RequestInsight
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      className="request-insights-row"
      data-selected={selected}
      onClick={onSelect}
      type="button"
    >
      <span className="request-insights-status" data-status={request.status} />
      <span className="request-insights-route">
        {request.route ?? request.url ?? 'Unknown route'}
      </span>
      <span className="request-insights-duration">
        {formatDuration(request.durationMs)}
      </span>
      <span className="request-insights-meta">
        {formatClockTime(request.startTime)}
      </span>
      <span className="request-insights-meta">
        {request.fetches.length
          ? `${request.fetches.length} fetch${request.fetches.length === 1 ? '' : 'es'}`
          : 'No fetches'}
      </span>
    </button>
  )
}

function RequestDetails({ request }: { request: RequestInsight }) {
  const [verbose, setVerbose] = useState(false)
  const timelineItems = useMemo(
    () => getTimelineItems(request, verbose),
    [request, verbose]
  )
  const hiddenTimelineItemCount = useMemo(
    () =>
      getTimelineItems(request, true).length -
      getTimelineItems(request, false).length,
    [request]
  )
  const overview = useMemo(() => getRequestOverview(request), [request])
  const diagnosis = getDiagnosis(request, timelineItems)

  return (
    <div className="request-insights-details">
      <div className="request-insights-summary">
        <div className="request-insights-heading">
          <div className="request-insights-title-row">
            <div className="request-insights-title">
              {request.route ?? request.url ?? request.requestId}
            </div>
            <CopyButton
              actionLabel="Copy request JSON"
              className="request-insights-copy"
              content={JSON.stringify(request, null, 2)}
              successLabel="Copied request JSON"
            />
            <label className="request-insights-verbose-toggle">
              <input
                checked={verbose}
                onChange={(event) => setVerbose(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>Verbose</span>
            </label>
          </div>
          <div className="request-insights-id">
            request {shortId(request.requestId)} · page{' '}
            {shortId(request.htmlRequestId)}
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

      <Timeline
        hiddenItemCount={verbose ? 0 : hiddenTimelineItemCount}
        items={timelineItems}
        request={request}
      />

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
      <span>Method {overview.method}</span>
      <span>Status {overview.statusLabel}</span>
      <span>{overview.kind}</span>
      <span>{overview.fetchSummary}</span>
      <span>{overview.cacheSummary}</span>
      <span>{overview.spanSummary}</span>
    </div>
  )
}

function Timeline({
  hiddenItemCount,
  request,
  items,
}: {
  hiddenItemCount: number
  request: RequestInsight
  items: TimelineItem[]
}) {
  const requestDuration = Math.max(request.durationMs ?? 1, 1)

  return (
    <div className="request-insights-section">
      <div className="request-insights-section-heading">
        <div className="request-insights-section-title">Timeline</div>
        {hiddenItemCount > 0 ? (
          <div className="request-insights-section-note">
            {hiddenItemCount} hidden in focused view
          </div>
        ) : null}
      </div>
      <div className="request-insights-timeline">
        {PHASES.map((phase) => {
          const phaseItems = items.filter((item) => item.phase === phase)

          if (phaseItems.length === 0) {
            return null
          }

          return (
            <div className="request-insights-phase" key={phase}>
              <div className="request-insights-phase-title">{phase}</div>
              {phaseItems.map((item) => {
                const offset = Math.max(item.startTime - request.startTime, 0)
                const duration = Math.max(item.durationMs ?? 0.5, 0.5)
                const left = Math.min((offset / requestDuration) * 100, 100)
                const width = Math.max((duration / requestDuration) * 100, 1)

                return (
                  <div
                    className="request-insights-span-row"
                    data-critical={item.isCritical}
                    data-kind={item.kind}
                    key={item.id}
                    title={
                      item.detail
                        ? `${item.label} · ${item.detail}`
                        : item.label
                    }
                  >
                    <span className="request-insights-span-name">
                      <span>{item.label}</span>
                      {item.detail ? (
                        <span className="request-insights-span-detail">
                          {item.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="request-insights-span-offset">
                      +{formatDuration(offset)}
                    </span>
                    <span className="request-insights-span-track">
                      <span
                        className="request-insights-span-bar"
                        data-status={item.status}
                        style={{
                          left: `${left}%`,
                          width: `${Math.min(width, 100 - left)}%`,
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
          )
        })}
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

function getTimelineItems(
  request: RequestInsight,
  verbose: boolean
): TimelineItem[] {
  const items = [
    ...request.spans
      .filter((span) => {
        if (verbose) {
          return true
        }

        const phase = getSpanPhase(span)
        return (
          phase !== 'Framework' ||
          (span.durationMs ?? 0) >= FOCUSED_MIN_FRAMEWORK_DURATION_MS
        )
      })
      .filter((span) => {
        if (verbose) {
          return true
        }

        return span.attributes?.['next.span_type'] !== 'AppRender.fetch'
      })
      .map((span, index) => getSpanTimelineItem(span, index, verbose)),
    ...request.fetches
      .filter((fetch) => fetch.startTime !== undefined)
      .map((fetch, index) => getFetchTimelineItem(fetch, index)),
  ].sort((a, b) => a.startTime - b.startTime)

  const criticalItem = items.reduce<TimelineItem | null>((largest, item) => {
    if (!largest || (item.durationMs ?? 0) > (largest.durationMs ?? 0)) {
      return item
    }
    return largest
  }, null)

  return items.map((item) => ({
    ...item,
    isCritical: item === criticalItem && (item.durationMs ?? 0) > 0,
  }))
}

function getSpanTimelineItem(
  span: RequestInsightSpan,
  index: number,
  verbose: boolean
): TimelineItem {
  const type = span.attributes?.['next.span_type']
  const name = verbose ? span.name : getSpanLabel(span.name)

  return {
    id: `span:${span.spanId ?? index}:${span.startTime}`,
    phase: getSpanPhase(span),
    label: name,
    startTime: span.startTime,
    durationMs: span.durationMs,
    status: span.status ?? 'pending',
    kind: 'span',
    isCritical: false,
    detail: getSpanDetail(span, type, verbose),
  }
}

function getFetchTimelineItem(
  fetch: RequestInsightFetch,
  index: number
): TimelineItem {
  const urlParts = formatUrl(fetch.url)

  return {
    id: `fetch:${fetch.index ?? index}:${fetch.url ?? ''}:${fetch.startTime}`,
    phase: 'Fetches',
    label: `${fetch.method ?? 'GET'} ${urlParts.path}`,
    detail: fetch.cacheReason ?? fetch.cacheStatus,
    startTime: fetch.startTime!,
    durationMs: fetch.durationMs,
    status: getFetchStatus(fetch),
    kind: 'fetch',
    cacheReason: fetch.cacheReason,
    isCritical: false,
  }
}

function getSpanPhase(span: RequestInsightSpan): TimelinePhase {
  const type = span.attributes?.['next.span_type']

  if (type === 'AppRender.fetch') {
    return 'Fetches'
  }

  if (
    span.name === 'start response' ||
    type === 'NextNodeServer.startResponse'
  ) {
    return 'Response'
  }

  if (
    type === 'NextNodeServer.createComponentTree' ||
    type === 'AppRender.getBodyResult'
  ) {
    return 'Render'
  }

  return 'Framework'
}

function getRequestOverview(request: RequestInsight) {
  const method =
    getFirstStringAttribute(request, 'http.method') ??
    getMethodFromName(request.spans[0]?.name) ??
    'GET'
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
    kind: isRsc ? 'RSC request' : 'HTML request',
    fetchSummary: request.fetches.length
      ? `${request.fetches.length} fetch${request.fetches.length === 1 ? '' : 'es'}`
      : 'No fetches',
    cacheSummary:
      request.fetches.length === 0
        ? 'No cache data'
        : knownCacheCount === 0
          ? 'Cache status unknown'
          : `Cache ${cacheCounts.hit} hit, ${cacheCounts.skip} skip${
              cacheCounts.unknown ? `, ${cacheCounts.unknown} unknown` : ''
            }`,
    spanSummary: `${request.spans.length} span${request.spans.length === 1 ? '' : 's'}`,
    errorSummary,
  }
}

function getSpanDetail(
  span: RequestInsightSpan,
  type: unknown,
  verbose: boolean
): string | undefined {
  if (!verbose) {
    if (typeof span.attributes?.['next.segment'] === 'string') {
      return `segment ${span.attributes['next.segment']}`
    }
    return undefined
  }

  const details = [
    typeof type === 'string' ? type : undefined,
    typeof span.attributes?.['next.segment'] === 'string'
      ? `segment ${span.attributes['next.segment']}`
      : undefined,
    span.traceId ? `trace ${shortSpanId(span.traceId)}` : undefined,
    span.spanId ? `span ${shortSpanId(span.spanId)}` : undefined,
    span.parentSpanId ? `parent ${shortSpanId(span.parentSpanId)}` : undefined,
    span.events?.length
      ? `${span.events.length} event${span.events.length === 1 ? '' : 's'}`
      : undefined,
    span.links?.length
      ? `${span.links.length} link${span.links.length === 1 ? '' : 's'}`
      : undefined,
  ].filter((detail): detail is string => Boolean(detail))

  return details.length ? details.join(' · ') : undefined
}

function getDiagnosis(
  request: RequestInsight,
  timelineItems: TimelineItem[]
): string {
  const criticalItem = timelineItems.find((item) => item.isCritical)
  const slowestFetch = request.fetches.reduce<RequestInsightFetch | null>(
    (slowest, fetch) => {
      if (!slowest || (fetch.durationMs ?? 0) > (slowest.durationMs ?? 0)) {
        return fetch
      }
      return slowest
    },
    null
  )

  if (slowestFetch && (!criticalItem || criticalItem.kind === 'fetch')) {
    const urlParts = formatUrl(slowestFetch.url)
    return `Most time was spent in ${formatDuration(slowestFetch.durationMs)} of server fetch work to ${urlParts.path}${getCacheSummary(slowestFetch)}.`
  }

  if (criticalItem) {
    return `Most time was spent in ${formatDuration(criticalItem.durationMs)} of ${criticalItem.phase.toLowerCase()} work: ${criticalItem.label}.`
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

function getSpanLabel(name: string): string {
  if (name === 'resolve segment modules') {
    return 'resolve segment'
  }

  if (name === 'build component tree') {
    return 'build component tree'
  }

  return name
}

function getFetchStatus(fetch: RequestInsightFetch): 'ok' | 'error' {
  return fetch.statusCode && fetch.statusCode >= 400 ? 'error' : 'ok'
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

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) {
    return '-'
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`
  }

  return `${(durationMs / 1000).toFixed(2)} s`
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function shortSpanId(id: string): string {
  return id.length > 8 ? id.slice(-8) : id
}
