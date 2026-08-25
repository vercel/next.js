import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { ContextMenu } from '@base-ui-components/react/context-menu'
import { Menu } from '@base-ui-components/react/menu'
import {
  getRequestInsightKey,
  getRequestInsightKind,
  type RequestInsight,
  type RequestInsightFetch,
} from '../../../shared/request-insights'
import {
  getRequestInsightFetchCount,
  getRequestInsightSpanCount,
  isRequestInsightSummary,
  type RequestInsightListItem,
} from '../../../shared/request-insights-summary'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { ACTION_DEVTOOLS_CONFIG } from '../../shared'
import { saveDevToolsConfig } from '../../utils/save-devtools-config'
import { CopyButton } from '../copy-button'
import { Tooltip } from '../tooltip/tooltip'
import GearIcon from '../../icons/gear-icon'
import { getFetchUrlPresentation } from './fetch-label'
import { formatDuration } from './format-duration'
import {
  getRequestInsightFilterResult,
  REQUEST_INSIGHT_FILTER_GROUPS,
  toggleRequestInsightFilter,
  type RequestInsightFilter,
} from './request-filters'
import {
  formatRequestRouteParams,
  getRequestDisplayUrl,
  getRequestInsightAgentPrompt,
  getRequestInsightSpanAgentPrompt,
  getRequestListDisplayUrl,
  getRequestRouteParams,
} from './request-label'
import {
  getActiveRequestKey,
  getRequestInsightRowType,
  getRequestInsightStatusCode,
  getRequestInsightSummaryTypeLabel,
  getRequestListEntries,
  isInternalRequestInsight,
  isPageLoadRequest,
  type RequestListEntry,
} from './request-list'
import {
  getTraceItems,
  getTraceNavigationIndex,
  getTracePosition,
  getTraceRange,
  type TraceItem,
} from './trace-viewer'
import {
  loadRequestInsightDetail,
  useRequestInsightsHistory,
} from './request-insights-history'
import './request-insights-panel.css'

const TRACE_TICK_COUNT = 5
const REQUEST_ROW_HEIGHT = 52
const REQUEST_ROW_OVERSCAN = 8
const REQUEST_SCROLLBAR_TRACK_INSET = 4
const REQUEST_SCROLLBAR_MIN_THUMB_HEIGHT = 24

export function RequestInsightsPanel() {
  const { dispatch, state, shadowRoot } = useDevOverlayContext()
  const [activeFilters, setActiveFilters] = useState<
    readonly RequestInsightFilter[]
  >([])
  const { showInternal, verbose } = state.requestInsightsConfig
  const showInternalInList =
    showInternal || activeFilters.includes('activity:instant-insights')
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
  const history = useRequestInsightsHistory({
    activeFilters,
    liveRequests: state.requestInsights,
    showInternal: showInternalInList,
  })
  const [pausedRequests, setPausedRequests] = useState<
    readonly RequestInsightListItem[] | null
  >(null)
  const requests = pausedRequests ?? history.requests
  const isPaused = pausedRequests !== null
  const filterResult = useMemo(
    () => getRequestInsightFilterResult(requests, activeFilters, showInternal),
    [activeFilters, requests, showInternal]
  )
  const listEntries = useMemo(
    () => getRequestListEntries(filterResult.requests, showInternalInList),
    [filterResult.requests, showInternalInList]
  )
  const visibleRequests = useMemo(
    () => listEntries.map((entry) => entry.request),
    [listEntries]
  )
  const [selectedRequestKey, setSelectedRequestKey] = useState<string | null>(
    () => getActiveRequestKey(visibleRequests, null)
  )
  const [contextMenuRequestKey, setContextMenuRequestKey] = useState<
    string | null
  >(null)
  const activeRequestKey = getActiveRequestKey(
    visibleRequests,
    selectedRequestKey
  )
  const selectedListItem =
    visibleRequests.find(
      (request) => getRequestInsightKey(request) === activeRequestKey
    ) ?? null
  const [historicalRequest, setHistoricalRequest] = useState<{
    key: string
    request: RequestInsight
  } | null>(null)
  useEffect(() => {
    if (!selectedListItem || !isRequestInsightSummary(selectedListItem)) {
      return
    }

    const controller = new AbortController()
    const key = getRequestInsightKey(selectedListItem)
    void loadRequestInsightDetail(selectedListItem, controller.signal).then(
      (request) => {
        if (request) {
          setHistoricalRequest({ key, request })
        }
      }
    )
    return () => controller.abort()
  }, [selectedListItem])
  const selectedRequest = selectedListItem
    ? isRequestInsightSummary(selectedListItem)
      ? historicalRequest?.key === getRequestInsightKey(selectedListItem)
        ? historicalRequest.request
        : null
      : selectedListItem
    : null
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
  const showInternalToggle =
    internalRequests.length > 0 ||
    history.optionCounts['activity:instant-insights'] > 0

  if (requests.length === 0 && !history.loading) {
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
          <div className="request-insights-list-controls">
            {isPaused ? (
              <div
                aria-atomic="true"
                aria-live="polite"
                className="request-insights-update-status"
                role="status"
              >
                <span className="request-insights-paused-state">Paused</span>
              </div>
            ) : null}
            <RequestFiltersMenu
              activeFilters={activeFilters}
              onReset={() => setActiveFilters([])}
              onToggle={(filter) =>
                setActiveFilters((filters) =>
                  toggleRequestInsightFilter(filters, filter)
                )
              }
              optionCounts={
                isPaused ? filterResult.optionCounts : history.optionCounts
              }
              shadowRoot={shadowRoot}
            />
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
                      <Menu.CheckboxItem
                        checked={isPaused}
                        className="request-insights-settings-item"
                        closeOnClick={false}
                        onCheckedChange={(checked) =>
                          setPausedRequests(
                            checked ? [...history.requests] : null
                          )
                        }
                      >
                        <span
                          className="request-insights-settings-checkbox"
                          data-checked={isPaused || undefined}
                        >
                          {isPaused ? <CheckIcon /> : null}
                        </span>
                        Pause updates
                      </Menu.CheckboxItem>
                      {showInternalToggle ? (
                        <Menu.CheckboxItem
                          checked={showInternal}
                          className="request-insights-settings-item"
                          closeOnClick={false}
                          onCheckedChange={(checked) =>
                            setRequestInsightsConfig({
                              showInternal: checked,
                            })
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
        </div>
        {activeFilters.length > 0 ? (
          <div className="request-insights-filter-status">
            <span>
              {isPaused
                ? filterResult.matchingRequestCount
                : history.matchingRequestCount}{' '}
              of{' '}
              {isPaused
                ? filterResult.totalRequestCount
                : history.totalRequestCount}{' '}
              requests
            </span>
            <button onClick={() => setActiveFilters([])} type="button">
              Reset
            </button>
          </div>
        ) : null}
        {listEntries.length === 0 ? (
          <div className="request-insights-list-empty">
            {activeFilters.length > 0 ? (
              <>
                No requests match the active filters.{' '}
                <button onClick={() => setActiveFilters([])} type="button">
                  Reset filters
                </button>
              </>
            ) : (
              <>
                Only internal activity has been captured. Enable “Internal
                activity” to view it.
              </>
            )}
          </div>
        ) : (
          <VirtualRequestList
            activeRequestKey={activeRequestKey}
            contextMenuRequestKey={contextMenuRequestKey}
            entries={listEntries}
            hasMore={!isPaused && history.hasMore}
            initialRequestId={initialRequestId}
            loading={history.loading}
            onContextMenuOpenChange={(requestKey, open) => {
              setContextMenuRequestKey((openRequestKey) => {
                if (open) {
                  return requestKey
                }
                return openRequestKey === requestKey ? null : openRequestKey
              })
            }}
            onLoadMore={history.loadMore}
            onSelect={setSelectedRequestKey}
            shadowRoot={shadowRoot}
            truncated={history.truncated}
          />
        )}
      </div>

      {selectedRequest ? (
        <RequestDetails request={selectedRequest} verbose={verbose} />
      ) : selectedListItem ? (
        <div className="request-insights-details-loading">
          Loading request details…
        </div>
      ) : null}
    </div>
  )
}

function VirtualRequestList({
  activeRequestKey,
  contextMenuRequestKey,
  entries,
  hasMore,
  initialRequestId,
  loading,
  onContextMenuOpenChange,
  onLoadMore,
  onSelect,
  shadowRoot,
  truncated,
}: {
  activeRequestKey: string | null
  contextMenuRequestKey: string | null
  entries: readonly RequestListEntry[]
  hasMore: boolean
  initialRequestId: string | undefined
  loading: boolean
  onContextMenuOpenChange: (requestKey: string, open: boolean) => void
  onLoadMore: () => void
  onSelect: (requestKey: string) => void
  shadowRoot: ShadowRoot
  truncated: boolean
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollbarDragRef = useRef<{
    pointerId: number
    pointerY: number
    scrollTop: number
  } | null>(null)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const observer = new ResizeObserver(() => {
      setViewportHeight(viewport.clientHeight)
    })
    observer.observe(viewport)
    setViewportHeight(viewport.clientHeight)
    return () => observer.disconnect()
  }, [])

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / REQUEST_ROW_HEIGHT) - REQUEST_ROW_OVERSCAN
  )
  const endIndex = Math.min(
    entries.length,
    Math.ceil((scrollTop + viewportHeight) / REQUEST_ROW_HEIGHT) +
      REQUEST_ROW_OVERSCAN
  )
  const footerHeight = loading || hasMore || truncated ? 32 : 0
  const contentHeight = entries.length * REQUEST_ROW_HEIGHT + footerHeight
  const maxScrollTop = Math.max(0, contentHeight - viewportHeight)
  const scrollbarTrackHeight = Math.max(
    0,
    viewportHeight - REQUEST_SCROLLBAR_TRACK_INSET * 2
  )
  const scrollbarThumbHeight =
    maxScrollTop > 0
      ? Math.max(
          REQUEST_SCROLLBAR_MIN_THUMB_HEIGHT,
          (viewportHeight / contentHeight) * scrollbarTrackHeight
        )
      : 0
  const scrollbarThumbTravel = Math.max(
    0,
    scrollbarTrackHeight - scrollbarThumbHeight
  )
  const scrollbarThumbTop =
    maxScrollTop > 0 ? (scrollTop / maxScrollTop) * scrollbarThumbTravel : 0

  const scrollFromThumbDelta = (
    pointerDelta: number,
    startScrollTop: number
  ) => {
    const viewport = viewportRef.current
    if (!viewport || scrollbarThumbTravel === 0) {
      return
    }
    viewport.scrollTop =
      startScrollTop + (pointerDelta / scrollbarThumbTravel) * maxScrollTop
  }

  useEffect(() => {
    if (
      hasMore &&
      !loading &&
      viewportHeight > entries.length * REQUEST_ROW_HEIGHT
    ) {
      onLoadMore()
    }
  }, [entries.length, hasMore, loading, onLoadMore, viewportHeight])

  return (
    <div
      aria-label="Requests"
      className="request-insights-list-scroll"
      onScroll={() => {
        const viewport = viewportRef.current
        if (!viewport) {
          return
        }
        setScrollTop(viewport.scrollTop)
        if (
          hasMore &&
          !loading &&
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
            REQUEST_ROW_HEIGHT * 4
        ) {
          onLoadMore()
        }
      }}
      ref={viewportRef}
      role="region"
      tabIndex={0}
    >
      <div
        className="request-insights-list-virtual-content"
        style={{ height: contentHeight }}
      >
        {entries
          .slice(startIndex, endIndex)
          .map(({ request, nested }, index) => {
            const requestKey = getRequestInsightKey(request)
            const itemIndex = startIndex + index
            return (
              <div
                className="request-insights-list-virtual-row"
                key={requestKey}
                style={{
                  transform: `translateY(${itemIndex * REQUEST_ROW_HEIGHT}px)`,
                }}
              >
                <RequestRow
                  contextMenuOpen={requestKey === contextMenuRequestKey}
                  nested={nested}
                  onContextMenuOpenChange={(open) =>
                    onContextMenuOpenChange(requestKey, open)
                  }
                  request={request}
                  pageLoad={isPageLoadRequest(request, initialRequestId)}
                  selected={requestKey === activeRequestKey}
                  shadowRoot={shadowRoot}
                  onSelect={() => onSelect(requestKey)}
                />
              </div>
            )
          })}
        {footerHeight > 0 ? (
          <div
            className="request-insights-history-status"
            style={{
              transform: `translateY(${entries.length * REQUEST_ROW_HEIGHT}px)`,
            }}
          >
            {loading
              ? 'Loading earlier requests…'
              : hasMore
                ? 'Scroll to load earlier requests'
                : truncated
                  ? 'Older requests were discarded to keep history within 50 MB.'
                  : null}
          </div>
        ) : null}
      </div>
      {maxScrollTop > 0 ? (
        <div
          aria-hidden="true"
          className="request-insights-list-scrollbar"
          onPointerDown={(event) => {
            if (event.button !== 0) {
              return
            }
            const trackBounds = event.currentTarget.getBoundingClientRect()
            const nextThumbTop = Math.min(
              scrollbarThumbTravel,
              Math.max(
                0,
                event.clientY - trackBounds.top - scrollbarThumbHeight / 2
              )
            )
            const viewport = viewportRef.current
            if (viewport && scrollbarThumbTravel > 0) {
              viewport.scrollTop =
                (nextThumbTop / scrollbarThumbTravel) * maxScrollTop
            }
          }}
          style={{
            height: scrollbarTrackHeight,
            transform: `translateY(${scrollTop + REQUEST_SCROLLBAR_TRACK_INSET}px)`,
          }}
        >
          <div
            className="request-insights-list-scrollbar-thumb"
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return
              }
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              scrollbarDragRef.current = {
                pointerId: event.pointerId,
                pointerY: event.clientY,
                scrollTop,
              }
            }}
            onPointerMove={(event) => {
              const drag = scrollbarDragRef.current
              if (!drag || drag.pointerId !== event.pointerId) {
                return
              }
              scrollFromThumbDelta(
                event.clientY - drag.pointerY,
                drag.scrollTop
              )
            }}
            onPointerCancel={() => {
              scrollbarDragRef.current = null
            }}
            onPointerUp={(event) => {
              if (scrollbarDragRef.current?.pointerId === event.pointerId) {
                scrollbarDragRef.current = null
              }
            }}
            style={{
              height: scrollbarThumbHeight,
              transform: `translateY(${scrollbarThumbTop}px)`,
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

function RequestFiltersMenu({
  activeFilters,
  onReset,
  onToggle,
  optionCounts,
  shadowRoot,
}: {
  activeFilters: readonly RequestInsightFilter[]
  onReset: () => void
  onToggle: (filter: RequestInsightFilter) => void
  optionCounts: Readonly<Record<RequestInsightFilter, number>>
  shadowRoot: ShadowRoot
}) {
  return (
    <Menu.Root delay={0} modal={false}>
      <Menu.Trigger
        aria-label={`Filter requests${activeFilters.length > 0 ? `, ${activeFilters.length} active` : ''}`}
        className="request-insights-filter-trigger"
      >
        Filter
        {activeFilters.length > 0 ? (
          <span className="request-insights-filter-active-count">
            {activeFilters.length}
          </span>
        ) : null}
      </Menu.Trigger>
      <Menu.Portal container={shadowRoot}>
        <Menu.Positioner
          align="end"
          className="request-insights-filter-positioner"
          side="bottom"
          sideOffset={4}
        >
          <Menu.Popup
            aria-label="Request filters"
            className="request-insights-filter-menu"
          >
            {REQUEST_INSIGHT_FILTER_GROUPS.map((group) => (
              <Menu.Group key={group.label}>
                <Menu.GroupLabel className="request-insights-filter-group-label">
                  {group.label}
                </Menu.GroupLabel>
                {group.options.map((option) => {
                  const checked = activeFilters.includes(option.value)
                  const count = optionCounts[option.value]
                  return (
                    <Menu.CheckboxItem
                      key={option.value}
                      checked={checked}
                      className="request-insights-filter-item"
                      closeOnClick={false}
                      data-filter-value={option.value}
                      disabled={!checked && count === 0}
                      onCheckedChange={() => onToggle(option.value)}
                    >
                      <span
                        className="request-insights-settings-checkbox"
                        data-checked={checked || undefined}
                      >
                        {checked ? <CheckIcon /> : null}
                      </span>
                      <span className="request-insights-filter-option-label">
                        {option.label}
                      </span>
                      <span className="request-insights-filter-option-count">
                        {count}
                      </span>
                    </Menu.CheckboxItem>
                  )
                })}
              </Menu.Group>
            ))}
            <Menu.Item
              className="request-insights-filter-reset"
              disabled={activeFilters.length === 0}
              onClick={onReset}
            >
              Reset filters
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

function RequestRow({
  request,
  nested,
  pageLoad,
  selected,
  shadowRoot,
  contextMenuOpen,
  onContextMenuOpenChange,
  onSelect,
}: {
  request: RequestInsightListItem
  nested: boolean
  pageLoad: boolean
  selected: boolean
  shadowRoot: ShadowRoot
  contextMenuOpen: boolean
  onContextMenuOpenChange: (open: boolean) => void
  onSelect: () => void
}) {
  const isInstantInsights =
    getRequestInsightKind(request) === 'instant-insights'
  const requestType = getRequestInsightRowType(request, pageLoad)
  const requestUrl = getRequestListDisplayUrl(
    request,
    requestType.type === 'rsc'
  )
  const clockTime = formatClockTime(request.startTime)
  const bypassesProxy = request.proxyStatus === 'bypassed'

  return (
    <ContextMenu.Root
      onOpenChange={onContextMenuOpenChange}
      open={contextMenuOpen}
    >
      <ContextMenu.Trigger
        render={
          <button
            aria-label={`${isInstantInsights ? `Instant Insights for ${requestUrl}` : requestUrl}, ${requestType.accessibleLabel}, ${bypassesProxy ? 'Did not match the configured proxy, ' : ''}${formatDuration(request.durationMs)}, ${clockTime}`}
            className="request-insights-row"
            data-internal={isInstantInsights || undefined}
            data-nested={nested || undefined}
            data-page-load={pageLoad}
            data-selected={selected}
            onClick={onSelect}
            onContextMenu={onSelect}
            type="button"
          />
        }
      >
        <span
          className="request-insights-status"
          data-status={request.status}
        />
        <span className="request-insights-route">
          {nested ? <NestedArrowIcon /> : null}
          <span className="request-insights-route-label">
            {isInstantInsights ? 'Instant Insights' : requestUrl}
          </span>
        </span>
        <span className="request-insights-duration">
          {formatDuration(request.durationMs)}
        </span>
        <span className="request-insights-meta request-insights-row-metadata">
          <span
            className="request-insights-request-type"
            data-type={requestType.type}
            title={requestType.accessibleLabel}
          >
            {requestType.label}
          </span>
          {bypassesProxy ? (
            <span
              className="request-insights-request-activity"
              title="This request did not match the configured proxy"
            >
              No proxy
            </span>
          ) : null}
          <span>{clockTime}</span>
        </span>
        <span className="request-insights-meta request-insights-fetch-summary">
          {getRequestInsightFetchCount(request)
            ? `${getRequestInsightFetchCount(request)} fetch${getRequestInsightFetchCount(request) === 1 ? '' : 'es'}`
            : 'No fetches'}
        </span>
      </ContextMenu.Trigger>
      <ContextMenu.Portal container={shadowRoot}>
        <RequestInsightsContextMenuBackdrop
          onClose={() => onContextMenuOpenChange(false)}
        />
        <ContextMenu.Positioner
          className="request-insights-context-positioner"
          sideOffset={4}
        >
          <ContextMenu.Popup
            aria-label={`Actions for request ${request.requestId}`}
            className="request-insights-context-menu"
          >
            <ContextMenu.Group>
              <ContextMenu.GroupLabel className="request-insights-context-label">
                Request
              </ContextMenu.GroupLabel>
              <div className="request-insights-context-preview">
                <RequestContextMenuPreview
                  request={request}
                  requestUrl={requestUrl}
                />
              </div>
            </ContextMenu.Group>
            <ContextMenu.Separator className="request-insights-context-separator" />
            <RequestContextMenuItem
              getValue={() => request.requestId}
              label="Copy request ID"
            />
            <RequestContextMenuItem
              getValue={() => getRequestInsightAgentPrompt(request)}
              label="Copy agent prompt"
            />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function RequestContextMenuPreview({
  request,
  requestUrl,
}: {
  request: RequestInsightListItem
  requestUrl: string
}) {
  const statusCode = getRequestInsightStatusCode(request)
  const fetchCount = getRequestInsightFetchCount(request)
  const spanCount = getRequestInsightSpanCount(request)

  return (
    <>
      <strong title={requestUrl}>{requestUrl}</strong>
      <span>
        {statusCode ?? request.status} ·{' '}
        {getRequestInsightSummaryTypeLabel(request)}
      </span>
      <span>
        {formatDuration(request.durationMs)} · {spanCount} span
        {spanCount === 1 ? '' : 's'} · {fetchCount} fetch
        {fetchCount === 1 ? '' : 'es'}
      </span>
      <code title={request.requestId}>{request.requestId}</code>
    </>
  )
}

function RequestContextMenuItem({
  getValue,
  label,
}: {
  getValue: () => string
  label: string
}) {
  return (
    <ContextMenu.Item
      className="request-insights-context-item"
      onClick={() => copyToClipboard(getValue())}
    >
      {label}
    </ContextMenu.Item>
  )
}

function RequestInsightsContextMenuBackdrop({
  onClose,
}: {
  onClose: () => void
}) {
  return (
    <ContextMenu.Backdrop
      className="request-insights-context-backdrop"
      onPointerDown={onClose}
    />
  )
}

function copyToClipboard(value: string) {
  if (!navigator.clipboard) {
    console.warn('Copy to clipboard is not supported in this browser')
    return
  }

  void navigator.clipboard.writeText(value).catch((error) => {
    console.warn(error)
  })
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
    () =>
      getTraceItems(
        request,
        verbose,
        typeof window === 'undefined' ? undefined : window.location.origin
      ),
    [request, verbose]
  )
  const overview = useMemo(() => getRequestOverview(request), [request])
  const diagnosis = verbose ? getDiagnosis(request, traceItems) : null
  const requestUrl = getRequestDisplayUrl(request)

  return (
    <div className="request-insights-details">
      <div className="request-insights-summary">
        <div className="request-insights-heading">
          <div className="request-insights-title-row">
            <div className="request-insights-title">
              {getRequestInsightKind(request) === 'instant-insights'
                ? `Instant Insights · ${requestUrl}`
                : requestUrl}
            </div>
            <CopyButton
              actionLabel="Copy request path"
              className="request-insights-copy"
              content={requestUrl}
              successLabel="Copied request path"
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
      {diagnosis ? (
        <div className="request-insights-diagnosis">{diagnosis}</div>
      ) : null}

      <Trace
        items={traceItems}
        key={getRequestInsightKey(request)}
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
      {overview.method ? <span>Method {overview.method}</span> : null}
      <span>Status {overview.statusLabel}</span>
      <span>{overview.kind}</span>
      <span>{overview.fetchSummary}</span>
      <span>{overview.cacheSummary}</span>
      <span>{overview.spanSummary}</span>
      {overview.route ? (
        <span className="request-insights-route-template">
          Route {overview.route}
        </span>
      ) : null}
      {overview.routeParams?.length ? (
        <Tooltip
          className="request-insights-params-tooltip"
          title={formatRequestRouteParams(overview.routeParams)}
        >
          <button
            aria-label={`Route parameters: ${overview.routeParams
              .map(({ name }) => name)
              .join(', ')}`}
            className="request-insights-params-trigger"
            type="button"
          >
            Params {overview.routeParams.map(({ name }) => name).join(', ')}
          </button>
        </Tooltip>
      ) : null}
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
  const { shadowRoot } = useDevOverlayContext()
  const [activeItemId, setActiveItemId] = useState<string | null>(
    items[0]?.id ?? null
  )
  const [contextMenuItemId, setContextMenuItemId] = useState<string | null>(
    null
  )
  const [activeTraceRow, setActiveTraceRow] = useState<HTMLElement | null>(null)
  const [isTraceFocused, setIsTraceFocused] = useState(false)
  const [isTraceTooltipOpen, setIsTraceTooltipOpen] = useState(false)
  const traceRowsRef = useRef<HTMLDivElement>(null)
  const shouldScrollActiveItemIntoViewRef = useRef(false)
  const traceId = useId()
  const range = getTraceRange(request)
  const activeItemIndex = items.findIndex((item) => item.id === activeItemId)
  const safeActiveItemIndex =
    items.length === 0 ? -1 : Math.max(activeItemIndex, 0)
  const activeItem = items[safeActiveItemIndex]
  const activeItemDescription = activeItem
    ? getTraceItemDescription(activeItem, range)
    : null

  useEffect(() => {
    if (
      !shouldScrollActiveItemIntoViewRef.current ||
      safeActiveItemIndex === -1
    ) {
      return
    }

    shouldScrollActiveItemIntoViewRef.current = false
    const activeOption =
      traceRowsRef.current?.children.item(safeActiveItemIndex)
    if (activeOption instanceof HTMLElement) {
      activeOption.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }, [safeActiveItemIndex])

  const ticks = Array.from({ length: TRACE_TICK_COUNT }, (_, index) => {
    const position = index / (TRACE_TICK_COUNT - 1)
    return {
      label: formatDuration(range.durationMs * position),
      position: position * 100,
    }
  })
  const handleTraceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }

      const nextIndex = getTraceNavigationIndex(
        activeItemIndex,
        items.length,
        event.key
      )
      if (nextIndex === undefined) {
        return
      }

      event.preventDefault()
      shouldScrollActiveItemIntoViewRef.current = true
      setActiveItemId(items[nextIndex]?.id ?? null)
    },
    [activeItemIndex, items]
  )
  const handleTracePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const row = target.closest<HTMLElement>('[data-trace-index]')
      if (row === null || !event.currentTarget.contains(row)) {
        return
      }

      const index = Number(row.dataset.traceIndex)
      if (Number.isSafeInteger(index)) {
        shouldScrollActiveItemIntoViewRef.current = false
        const itemId = items[index]?.id
        if (itemId !== undefined) {
          setActiveItemId((currentItemId) =>
            currentItemId === itemId ? currentItemId : itemId
          )
        }
      }
    },
    [items]
  )

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
        <div
          className="request-insights-trace"
          onPointerMove={handleTracePointerMove}
        >
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
          <Tooltip
            anchor={activeTraceRow}
            asChild
            className="request-insights-trace-tooltip"
            direction="top"
            onOpenChange={setIsTraceTooltipOpen}
            open={isTraceFocused || isTraceTooltipOpen}
            title={activeItemDescription}
          >
            <div
              aria-activedescendant={
                safeActiveItemIndex === -1
                  ? undefined
                  : `${traceId}-item-${safeActiveItemIndex}`
              }
              aria-label={`Trace spans, ${items.length} item${items.length === 1 ? '' : 's'}. Use arrow keys to inspect timing.`}
              className="request-insights-trace-rows"
              onBlur={() => setIsTraceFocused(false)}
              onFocus={() => setIsTraceFocused(true)}
              onKeyDown={handleTraceKeyDown}
              ref={traceRowsRef}
              role="listbox"
              tabIndex={items.length === 0 ? undefined : 0}
            >
              {items.map((item, index) => {
                const position = getTracePosition(item, range)
                const description = getTraceItemDescription(item, range)

                return (
                  <TraceSpanContextMenu
                    item={item}
                    key={item.id}
                    onOpenChange={(open) => {
                      setContextMenuItemId((openItemId) => {
                        if (open) {
                          return item.id
                        }
                        return openItemId === item.id ? null : openItemId
                      })
                    }}
                    open={contextMenuItemId === item.id}
                    request={request}
                    shadowRoot={shadowRoot}
                  >
                    <div
                      aria-label={description}
                      aria-selected={index === safeActiveItemIndex}
                      className="request-insights-span-row"
                      data-active={index === safeActiveItemIndex || undefined}
                      data-kind={item.kind}
                      data-trace-item-id={item.id}
                      data-trace-index={index}
                      id={`${traceId}-item-${index}`}
                      onContextMenu={() => setActiveItemId(item.id)}
                      ref={
                        index === safeActiveItemIndex
                          ? setActiveTraceRow
                          : undefined
                      }
                      role="option"
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
                  </TraceSpanContextMenu>
                )
              })}
            </div>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}

function TraceSpanContextMenu({
  children,
  item,
  onOpenChange,
  open,
  request,
  shadowRoot,
}: {
  children: ReactElement<Record<string, unknown>>
  item: TraceItem
  onOpenChange: (open: boolean) => void
  open: boolean
  request: RequestInsight
  shadowRoot: ShadowRoot
}) {
  const spanId = item.spanId
  if (!spanId) {
    return children
  }

  const label = item.fullLabel ?? item.label

  return (
    <ContextMenu.Root onOpenChange={onOpenChange} open={open}>
      <ContextMenu.Trigger render={children} />
      <ContextMenu.Portal container={shadowRoot}>
        <RequestInsightsContextMenuBackdrop
          onClose={() => onOpenChange(false)}
        />
        <ContextMenu.Positioner
          className="request-insights-context-positioner"
          sideOffset={4}
        >
          <ContextMenu.Popup
            aria-label={`Actions for span ${spanId}`}
            className="request-insights-context-menu"
          >
            <ContextMenu.Group>
              <ContextMenu.GroupLabel className="request-insights-context-label">
                Span
              </ContextMenu.GroupLabel>
              <div className="request-insights-context-preview">
                <strong title={label}>{label}</strong>
                <span>
                  {item.category === 'nextjs' ? 'Next.js' : 'Application'} ·{' '}
                  {formatDuration(item.durationMs)} · {item.status}
                </span>
                <code title={spanId}>{spanId}</code>
              </div>
            </ContextMenu.Group>
            <ContextMenu.Separator className="request-insights-context-separator" />
            <RequestContextMenuItem
              getValue={() => spanId}
              label="Copy span ID"
            />
            <RequestContextMenuItem
              getValue={() =>
                getRequestInsightSpanAgentPrompt(request.requestId, {
                  spanId,
                  label,
                })
              }
              label="Copy agent prompt"
            />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

function getTraceItemDescription(
  item: TraceItem,
  range: ReturnType<typeof getTraceRange>
): string {
  const position = getTracePosition(item, range)
  return `${item.fullLabel ?? item.label} · +${formatDuration(position.offsetMs)} · ${formatDuration(item.durationMs)}`
}

function FetchTable({ fetches }: { fetches: RequestInsightFetch[] }) {
  const currentOrigin =
    typeof window === 'undefined' ? undefined : window.location.origin

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
            const url = getFetchUrlPresentation(fetch.url, currentOrigin)
            return (
              <div
                className="request-insights-fetch"
                data-origin={url.originKind}
                key={index}
              >
                <span className="request-insights-method">
                  {fetch.method ?? 'GET'}
                </span>
                <span className="request-insights-fetch-url">
                  <Tooltip
                    className="request-insights-fetch-tooltip"
                    title={url.fullUrl}
                  >
                    <span className="request-insights-fetch-url-trigger">
                      <span className="request-insights-fetch-path">
                        {url.path}
                      </span>
                      <span
                        className="request-insights-fetch-origin"
                        data-origin={url.originKind}
                      >
                        {url.originLabel}
                      </span>
                    </span>
                  </Tooltip>
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
  const statusCode = getRequestInsightStatusCode(request)
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
    kind: getRequestInsightSummaryTypeLabel(request),
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
    route: request.route,
    routeParams: getRequestRouteParams(request),
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
    const url = getFetchUrlPresentation(
      slowestFetch.url,
      typeof window === 'undefined' ? undefined : window.location.origin
    )
    return `Slowest recorded operation: ${url.path} · ${formatDuration(slowestFetch.durationMs)}${getCacheSummary(slowestFetch)}.`
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

function getMethodFromName(name: string | undefined): string | undefined {
  const match = name?.match(
    /^(?:RSC )?(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b/
  )
  return match?.[1]
}

function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
