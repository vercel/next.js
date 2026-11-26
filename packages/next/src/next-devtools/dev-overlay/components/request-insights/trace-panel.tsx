import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { ContextMenu } from '@base-ui-components/react/context-menu'
import type { RequestInsight } from '../../../shared/request-insights'
import { useDevOverlayContext } from '../../../dev-overlay.browser'
import { Tooltip } from '../tooltip/tooltip'
import { formatDuration } from '../../../../shared/lib/format-duration'
import { getRequestInsightSpanAgentPrompt } from './request-label'
import {
  getTraceNavigationIndex,
  getTracePosition,
  getTraceRange,
  type TraceItem,
} from './trace-viewer'
import {
  RequestContextMenuItem,
  RequestInsightsContextMenuBackdrop,
} from './context-menu'

const TRACE_TICK_COUNT = 5

export function Trace({
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
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const [contextMenuItemId, setContextMenuItemId] = useState<string | null>(
    null
  )
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null)
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
  const displayedItemId =
    contextMenuItemId ??
    hoveredItemId ??
    (isTraceFocused ? items[safeActiveItemIndex]?.id : null) ??
    inspectedItemId
  const displayedItemIndex = items.findIndex(
    (item) => item.id === displayedItemId
  )
  const activeItem = items[displayedItemIndex] ?? items[safeActiveItemIndex]
  const inspectedItem = items.find((item) => item.id === inspectedItemId)
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

      if (event.key === 'Escape' && inspectedItemId !== null) {
        event.preventDefault()
        setInspectedItemId(null)
        return
      }
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        safeActiveItemIndex !== -1
      ) {
        event.preventDefault()
        setInspectedItemId(items[safeActiveItemIndex].id)
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
      setHoveredItemId(null)
      setActiveItemId(items[nextIndex]?.id ?? null)
    },
    [activeItemIndex, inspectedItemId, items, safeActiveItemIndex]
  )
  const handleTracePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const row = target.closest<HTMLElement>('[data-trace-index]')
      if (row === null || !event.currentTarget.contains(row)) {
        setHoveredItemId(null)
        return
      }

      const index = Number(row.dataset.traceIndex)
      if (Number.isSafeInteger(index)) {
        shouldScrollActiveItemIntoViewRef.current = false
        const itemId = items[index]?.id
        if (itemId !== undefined) {
          setHoveredItemId(itemId)
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
          data-inspector-open={inspectedItem !== undefined || undefined}
          onPointerLeave={() => setHoveredItemId(null)}
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
                !isTraceFocused || safeActiveItemIndex === -1
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
                      aria-selected={
                        isTraceFocused && index === safeActiveItemIndex
                      }
                      className="request-insights-span-row"
                      data-active={index === displayedItemIndex || undefined}
                      data-category={item.category}
                      data-kind={item.kind}
                      data-trace-item-id={item.id}
                      data-trace-index={index}
                      id={`${traceId}-item-${index}`}
                      onClick={() => {
                        setActiveItemId(item.id)
                        setInspectedItemId(item.id)
                      }}
                      onContextMenu={() => setActiveItemId(item.id)}
                      ref={
                        index === displayedItemIndex
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
                            data-category={item.category}
                            data-kind={item.kind}
                            data-status={item.status}
                          />
                          <span className="request-insights-span-title">
                            {item.label}
                          </span>
                          {item.attributeLabel ? (
                            <span
                              className="request-insights-span-attribute-label"
                              title={item.attributeLabel}
                            >
                              {item.attributeLabel}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span className="request-insights-span-track">
                        <span
                          className="request-insights-span-bar"
                          data-category={item.category}
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
          {inspectedItem ? (
            <TraceInspector
              item={inspectedItem}
              onClose={() => setInspectedItemId(null)}
              range={range}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TraceInspector({
  item,
  onClose,
  range,
}: {
  item: TraceItem
  onClose: () => void
  range: ReturnType<typeof getTraceRange>
}) {
  const position = getTracePosition(item, range)
  const attributes = Object.entries(item.attributes ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  return (
    <div
      aria-label={`Span details for ${item.fullLabel ?? item.label}`}
      className="request-insights-trace-inspector"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
      role="region"
    >
      <div className="request-insights-trace-inspector-header">
        <div>
          <strong>{item.fullLabel ?? item.label}</strong>
          <span>
            {getTraceCategoryLabel(item.category)} · +
            {formatDuration(position.offsetMs)} ·{' '}
            {formatDuration(item.durationMs)}
            {' · '}
            {item.status}
          </span>
        </div>
        <button
          aria-label="Close span details"
          className="request-insights-trace-inspector-close"
          onClick={onClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {item.traceId || item.spanId || item.parentSpanId ? (
        <dl className="request-insights-trace-inspector-metadata">
          {item.traceId ? (
            <>
              <dt>Trace ID</dt>
              <dd>{item.traceId}</dd>
            </>
          ) : null}
          {item.spanId ? (
            <>
              <dt>Span ID</dt>
              <dd>{item.spanId}</dd>
            </>
          ) : null}
          {item.parentSpanId ? (
            <>
              <dt>Parent span ID</dt>
              <dd>{item.parentSpanId}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <div className="request-insights-trace-inspector-attributes">
        <strong>Attributes ({attributes.length})</strong>
        {attributes.length > 0 ? (
          <dl>
            {attributes.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{formatSpanAttributeValue(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <span className="request-insights-muted">No attributes</span>
        )}
      </div>
    </div>
  )
}

function formatSpanAttributeValue(
  value: NonNullable<TraceItem['attributes']>[string]
) {
  return Array.isArray(value) ? JSON.stringify(value) : String(value)
}

function getTraceCategoryLabel(category: TraceItem['category']): string {
  return category === 'nextjs'
    ? 'Next.js'
    : category === 'opentelemetry'
      ? 'OpenTelemetry'
      : 'Application'
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
                  {getTraceCategoryLabel(item.category)} ·{' '}
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
