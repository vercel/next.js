import * as React from 'react'
const { useMemo, useRef, useState, useEffect } = React
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type {
  TuiLogEntry,
  LogFilter,
  FetchMetricData,
  CompilationState,
  RequestData,
  ConsoleData,
  FetchData,
} from '../types'
import { LOG_FILTERS } from '../types'
import {
  TIMESTAMP_WIDTH,
  fitText,
  wrapText,
  getSourceLabel,
  getStatusColor,
  isCacheHit,
  getCacheColor,
  categorizeRequest,
  CATEGORY_COLORS,
  stripConsoleFormatting,
  parseStack,
  parseErrorWithLocation,
  urlPath,
} from '../utils'

interface LogPanelProps {
  logs: TuiLogEntry[]
  logFilter: LogFilter
  selectedIndex: number
  terminalHeight: number
  terminalWidth: number
  compilationState?: CompilationState
  compileStartTime?: number | null
  copied?: boolean | 'failed'
}

// === Helpers ===

const TS_PAD = ' '.repeat(TIMESTAMP_WIDTH)

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

// === Components ===

function SelectionWrapper({
  isSelected,
  children,
}: {
  isSelected: boolean
  children: React.ReactNode
}) {
  return (
    <Box>
      <Text color="cyan">{isSelected ? '▍' : ' '}</Text>
      {children}
    </Box>
  )
}

function FetchMetricsSummary({
  fetches,
  contentWidth,
  maxRows,
}: {
  fetches: FetchMetricData[]
  contentWidth: number
  maxRows?: number
}) {
  const cached = fetches.filter((f) => isCacheHit(f.cacheStatus))
  const uncached = fetches.filter((f) => !isCacheHit(f.cacheStatus))
  const uncachedTime = uncached.reduce((sum, f) => sum + f.totalTime, 0)

  // Cap visible fetches to fit within maxRows (summary header + fetch lines).
  const fetchBudget = maxRows !== undefined ? maxRows - 1 : fetches.length
  const showCount =
    fetchBudget >= fetches.length
      ? fetches.length
      : Math.max(0, fetchBudget - 1) // leave room for "+ N more"
  const hiddenCount = fetches.length - showCount

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{TS_PAD}</Text>
        <Text dimColor>↳ </Text>
        <Text>{fetches.length} fetches</Text>
        {cached.length > 0 && (
          <Text color="green"> · {cached.length} cached</Text>
        )}
        {uncached.length > 0 && (
          <Text color="yellow">
            {' '}
            · {uncached.length} uncached ({uncachedTime}ms)
          </Text>
        )}
      </Box>
      {fetches.slice(0, showCount).map((fetch, i) => {
        const timingStr = `${fetch.totalTime}ms`
        const reasonStr = fetch.cacheReason ? ` ← ${fetch.cacheReason}` : ''
        // Fixed: TS_PAD + "├ " (2) + "● " (2) + " " (1 after path) + timing + reason
        const fixedWidth =
          TIMESTAMP_WIDTH + 5 + timingStr.length + reasonStr.length
        const path = fitText(
          urlPath(fetch.url),
          Math.max(8, contentWidth - fixedWidth)
        )
        const isLast = hiddenCount === 0 && i === showCount - 1

        return (
          <Box key={i}>
            <Text>{TS_PAD}</Text>
            <Text dimColor>{isLast ? '└' : '├'} </Text>
            <Text color={getCacheColor(fetch.cacheStatus)}>
              {isCacheHit(fetch.cacheStatus) ? '●' : '○'}{' '}
            </Text>
            <Text dimColor>{path} </Text>
            <Text>{timingStr}</Text>
            {fetch.cacheReason && (
              <Text color="yellow" dimColor>
                {reasonStr}
              </Text>
            )}
          </Box>
        )
      })}
      {hiddenCount > 0 && (
        <Box>
          <Text>{TS_PAD}</Text>
          <Text dimColor>
            └ + {hiddenCount} more fetch{hiddenCount > 1 ? 'es' : ''}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function RequestLogEntry({
  data,
  timestamp,
  isSelected,
  contentWidth,
  maxHeight,
}: {
  data: RequestData
  timestamp: string
  isSelected: boolean
  contentWidth: number
  maxHeight?: number
}) {
  const statusColor = getStatusColor(data.status)
  const { category, routeName } = categorizeRequest(data.url)
  const routeColor = CATEGORY_COLORS[category]

  const compileTime = data.timings?.find((t) => t.label === 'compile')
  const renderTime = data.timings?.find((t) => t.label === 'render')
  const fetchCount = data.fetchMetrics?.length || 0
  const uncachedCount =
    data.fetchMetrics?.filter((f) => !isCacheHit(f.cacheStatus)).length || 0

  const isAction = data.requestType === 'action'
  const isNav = data.requestType === 'nav'
  const typeIndicator = isAction ? 'ƒ' : isNav ? '→' : null
  const typeColor = isAction ? 'magenta' : 'cyan'

  let displayRouteName = routeName
  if (isAction && data.serverAction?.functionName) {
    const file = data.serverAction.location
      ?.replace(/:\d+:\d+$/, '')
      .split('/')
      .pop()
      ?.replace(/\.(ts|tsx|js|jsx)$/, '')
    displayRouteName = file
      ? `${file}#${data.serverAction.functionName}()`
      : `${data.serverAction.functionName}()`
  }

  // Build suffix strings and progressively drop them if line is too wide
  const timingStr = `${data.totalTime}ms`
  const breakdownStr =
    compileTime && renderTime
      ? ` (${compileTime.time}ms build, ${renderTime.time}ms render)`
      : ''
  const fetchSuffix =
    !isSelected && fetchCount > 0
      ? ` · ${fetchCount} fetch${fetchCount > 1 ? 'es' : ''}` +
        (uncachedCount > 0 ? ` (${uncachedCount} uncached)` : '')
      : ''

  // Fixed prefix: timestamp + status + space + method + space + optional type indicator
  const statusStr = `${data.status}`
  const prefixWidth =
    TIMESTAMP_WIDTH +
    statusStr.length +
    1 +
    data.method.length +
    1 +
    (typeIndicator ? 2 : 0)

  // Determine what fits: route + space + timing [+ breakdown] [+ fetchSuffix]
  const coreWidth = 1 + timingStr.length
  let suffix = breakdownStr + fetchSuffix
  let available = contentWidth - prefixWidth - coreWidth - suffix.length

  // Drop optional suffixes progressively to make room for route name
  if (available < 4 && fetchSuffix) {
    suffix = breakdownStr
    available = contentWidth - prefixWidth - coreWidth - suffix.length
  }
  if (available < 4 && breakdownStr) {
    suffix = ''
    available = contentWidth - prefixWidth - coreWidth
  }

  const truncatedRoute = fitText(displayRouteName, available)

  return (
    <SelectionWrapper isSelected={isSelected}>
      <Box flexDirection="column">
        <Box>
          <Text dimColor={!isSelected}>
            {timestamp.padEnd(TIMESTAMP_WIDTH)}
          </Text>
          <Text color={statusColor} bold={isSelected}>
            {statusStr}{' '}
          </Text>
          <Text dimColor={!isSelected} bold={isSelected}>
            {data.method}{' '}
          </Text>
          {typeIndicator && (
            <Text color={typeColor} dimColor={!isSelected} bold={isSelected}>
              {typeIndicator}{' '}
            </Text>
          )}
          <Text
            color={isAction ? 'magenta' : routeColor}
            bold={isSelected}
            dimColor={!isSelected}
          >
            {truncatedRoute}{' '}
          </Text>
          <Text dimColor={!isSelected} bold={isSelected}>
            {timingStr}
          </Text>
          {suffix && <Text dimColor>{suffix}</Text>}
        </Box>
        {isSelected && data.fetchMetrics && data.fetchMetrics.length > 0 && (
          <FetchMetricsSummary
            fetches={data.fetchMetrics}
            contentWidth={contentWidth}
            maxRows={maxHeight !== undefined ? maxHeight - 1 : undefined}
          />
        )}
      </Box>
    </SelectionWrapper>
  )
}

function FetchLogEntry({
  data,
  timestamp,
  isSelected,
  contentWidth,
}: {
  data: FetchData
  timestamp: string
  isSelected: boolean
  contentWidth: number
}) {
  const statusColor = getStatusColor(data.status)
  const cacheColor = getCacheColor(data.cacheStatus)
  const timingStr = `${data.totalTime}ms`
  const cacheStr = data.cacheStatus ? ` (${data.cacheStatus})` : ''
  const reasonStr =
    data.cacheReason && !isCacheHit(data.cacheStatus)
      ? ` ← ${data.cacheReason}`
      : ''

  // Truncate URL to fit
  const fixedWidth =
    TIMESTAMP_WIDTH +
    `${data.status}`.length +
    1 +
    data.method.length +
    1 +
    1 +
    timingStr.length +
    cacheStr.length +
    reasonStr.length
  const display = fitText(
    urlPath(data.url),
    Math.max(10, contentWidth - fixedWidth)
  )

  return (
    <SelectionWrapper isSelected={isSelected}>
      <Box flexDirection="column">
        <Box>
          <Text dimColor={!isSelected}>
            {timestamp.padEnd(TIMESTAMP_WIDTH)}
          </Text>
          <Text color={statusColor} bold={isSelected}>
            {data.status}{' '}
          </Text>
          <Text dimColor={!isSelected} bold={isSelected}>
            {data.method}{' '}
          </Text>
          <Text color="blue" bold={isSelected} dimColor={!isSelected}>
            {display}{' '}
          </Text>
          <Text dimColor={!isSelected} bold={isSelected}>
            {timingStr}
          </Text>
          {cacheStr && (
            <Text color={cacheColor} dimColor={!isSelected} bold={isSelected}>
              {cacheStr}
            </Text>
          )}
          {reasonStr && (
            <Text color="yellow" dimColor={!isSelected} bold={isSelected}>
              {reasonStr}
            </Text>
          )}
        </Box>
        {data.cacheWarning && (
          <Box>
            <Text color="yellow">{data.cacheWarning}</Text>
          </Box>
        )}
      </Box>
    </SelectionWrapper>
  )
}

function ConsoleLogEntry({
  data,
  timestamp,
  isSelected,
  contentWidth,
}: {
  data: ConsoleData
  timestamp: string
  isSelected: boolean
  contentWidth: number
}) {
  const methodColor =
    data.method === 'error'
      ? 'red'
      : data.method === 'warn'
        ? 'yellow'
        : 'white'
  const sl = getSourceLabel(data.source)
  const displayMessage = stripConsoleFormatting(data.message)

  const parsed = data.rawStack && !data.stack ? parseStack(data.rawStack) : null
  const location = data.location || parsed?.location
  const stackLines = data.stack || parsed?.stackLines || []

  const prefixWidth = TIMESTAMP_WIDTH + (sl ? sl.label.length + 3 : 0)
  const wrappedMessage = wrapText(
    displayMessage,
    contentWidth - prefixWidth,
    contentWidth - TIMESTAMP_WIDTH
  )

  return (
    <SelectionWrapper isSelected={isSelected}>
      <Box flexDirection="column">
        <Box>
          <Text dimColor={!isSelected}>
            {timestamp.padEnd(TIMESTAMP_WIDTH)}
          </Text>
          {sl && (
            <Text color={sl.color} dimColor={!isSelected} bold={isSelected}>
              [{sl.label}]{' '}
            </Text>
          )}
          <Text color={methodColor} bold={isSelected} dimColor={!isSelected}>
            {wrappedMessage[0]}
          </Text>
          {wrappedMessage.length === 1 && location && !isSelected && (
            <Text dimColor> ({location})</Text>
          )}
        </Box>
        {wrappedMessage.slice(1).map((line, i) => (
          <Box key={i}>
            <Text>{TS_PAD}</Text>
            <Text color={methodColor} bold={isSelected} dimColor={!isSelected}>
              {line}
            </Text>
          </Box>
        ))}
        {isSelected && (
          <>
            {location && (
              <Box>
                <Text dimColor> {stackLines.length > 0 ? '├' : '└'} </Text>
                <Text>{location}</Text>
              </Box>
            )}
            {stackLines.length > 0 && (
              <Box flexDirection="column" paddingLeft={4}>
                {stackLines.slice(0, 10).map((line, i) => (
                  <Text key={i} dimColor>
                    {line}
                  </Text>
                ))}
                {stackLines.length > 10 && (
                  <Text dimColor>... {stackLines.length - 10} more frames</Text>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
    </SelectionWrapper>
  )
}

function GenericLogEntry({
  log,
  timestamp,
  isSelected,
  contentWidth,
}: {
  log: TuiLogEntry
  timestamp: string
  isSelected: boolean
  contentWidth: number
}) {
  const msg = log.message
  const isSystemLog = log.source === 'system' || !log.source
  const isError = isSystemLog && msg.startsWith('⨯')
  const isWarning = isSystemLog && msg.startsWith('⚠')

  if (isError || isWarning) {
    const color = isError ? 'red' : 'yellow'
    const typeLabel = isError ? 'Error: ' : 'Warning: '

    const parsed = parseErrorWithLocation(msg)
    const displayMsg = parsed
      ? parsed.file && parsed.line
        ? `${parsed.file}:${parsed.line}:${parsed.col}`
        : parsed.message
      : msg.replace(/^[⨯⚠]\s*/, '')

    const wrappedMessage = wrapText(
      displayMsg,
      contentWidth - TIMESTAMP_WIDTH - typeLabel.length,
      contentWidth - TIMESTAMP_WIDTH
    )

    return (
      <SelectionWrapper isSelected={isSelected}>
        <Box flexDirection="column">
          <Box>
            <Text dimColor={!isSelected}>
              {timestamp.padEnd(TIMESTAMP_WIDTH)}
            </Text>
            <Text color={color} bold>
              {typeLabel}
            </Text>
            <Text color={color} dimColor={!isSelected}>
              {wrappedMessage[0]}
            </Text>
          </Box>
          {wrappedMessage.slice(1).map((line, i) => (
            <Box key={i}>
              <Text>{TS_PAD}</Text>
              <Text color={color} dimColor={!isSelected}>
                {line}
              </Text>
            </Box>
          ))}
          {isSelected && parsed?.file && parsed.message && (
            <Box paddingLeft={1}>
              <Text color={color}>{parsed.message}</Text>
            </Box>
          )}
          {log.extraLines?.map((line, i) => (
            <Box key={i} paddingLeft={1}>
              <Text
                color={line.startsWith('http') ? 'cyan' : color}
                dimColor={!isSelected}
              >
                {line}
              </Text>
            </Box>
          ))}
        </Box>
      </SelectionWrapper>
    )
  }

  // Plain text fallback
  const sl = getSourceLabel(log.source)
  const prefixWidth = TIMESTAMP_WIDTH + (sl ? sl.label.length + 3 : 0)
  const wrappedMessage = wrapText(
    msg,
    contentWidth - prefixWidth,
    contentWidth - TIMESTAMP_WIDTH
  )

  return (
    <SelectionWrapper isSelected={isSelected}>
      <Box flexDirection="column">
        <Box>
          <Text dimColor={!isSelected}>
            {timestamp.padEnd(TIMESTAMP_WIDTH)}
          </Text>
          {sl && (
            <Text color={sl.color} dimColor={!isSelected} bold={isSelected}>
              [{sl.label}]{' '}
            </Text>
          )}
          <Text dimColor={!isSelected} bold={isSelected}>
            {wrappedMessage[0]}
          </Text>
        </Box>
        {wrappedMessage.slice(1).map((line, i) => (
          <Box key={i}>
            <Text>{TS_PAD}</Text>
            <Text dimColor={!isSelected} bold={isSelected}>
              {line}
            </Text>
          </Box>
        ))}
        {isSelected &&
          log.extraLines?.map((line, i) => (
            <Box key={i} paddingLeft={1}>
              <Text dimColor>{line}</Text>
            </Box>
          ))}
      </Box>
    </SelectionWrapper>
  )
}

function LogEntry({
  log,
  isSelected,
  contentWidth,
  maxHeight,
}: {
  log: TuiLogEntry
  isSelected: boolean
  contentWidth: number
  maxHeight?: number
}) {
  const timestamp = formatTimestamp(log.timestamp)
  const data = log.structured

  if (data?.type === 'request') {
    return (
      <RequestLogEntry
        data={data}
        timestamp={timestamp}
        isSelected={isSelected}
        contentWidth={contentWidth}
        maxHeight={maxHeight}
      />
    )
  }
  if (data?.type === 'fetch') {
    return (
      <FetchLogEntry
        data={data}
        timestamp={timestamp}
        isSelected={isSelected}
        contentWidth={contentWidth}
      />
    )
  }
  if (data?.type === 'console') {
    return (
      <ConsoleLogEntry
        data={data}
        timestamp={timestamp}
        isSelected={isSelected}
        contentWidth={contentWidth}
      />
    )
  }
  return (
    <GenericLogEntry
      log={log}
      timestamp={timestamp}
      isSelected={isSelected}
      contentWidth={contentWidth}
    />
  )
}

function FilterBar({
  filter,
  copied,
}: {
  filter: LogFilter
  copied?: boolean | 'failed'
}) {
  return (
    <Box paddingBottom={1} flexWrap="wrap">
      <Box>
        {LOG_FILTERS.map((f, i) => (
          <React.Fragment key={f.value}>
            {i > 0 && <Text dimColor> </Text>}
            <Text
              color={filter === f.value ? 'cyan' : undefined}
              bold={filter === f.value}
              dimColor={filter !== f.value}
            >
              [{f.key}]{f.label}
            </Text>
          </React.Fragment>
        ))}
      </Box>
      <Box flexGrow={1} />
      {copied === true && (
        <Text color="green" bold>
          Copied!
        </Text>
      )}
      {copied === 'failed' && (
        <Text color="red">Copy failed (install xclip or wl-copy)</Text>
      )}
      {!copied && <Text dimColor>←→ filter | ↑↓ select | c copy | q quit</Text>}
    </Box>
  )
}

function CompilationIndicator({
  trigger,
  startTime,
}: {
  trigger?: string
  startTime: number
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 100)
    return () => clearInterval(interval)
  }, [startTime])

  return (
    <Box paddingLeft={1}>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text color="cyan"> Compiling{trigger ? ` ${trigger}` : ''}</Text>
      <Text dimColor>... {(elapsed / 1000).toFixed(1)}s</Text>
    </Box>
  )
}

// === Height estimation for scroll windowing ===

function estimateLogHeight(
  log: TuiLogEntry,
  isSelected: boolean,
  contentWidth: number,
  maxHeight: number
): number {
  const data = log.structured

  if (data?.type === 'request') {
    const h =
      isSelected && data.fetchMetrics?.length ? 2 + data.fetchMetrics.length : 1
    return Math.min(h, maxHeight)
  }

  if (data?.type === 'fetch') {
    return 1 + (data.cacheWarning ? 1 : 0)
  }

  if (data?.type === 'console') {
    const sl = getSourceLabel(data.source)
    const prefixWidth = TIMESTAMP_WIDTH + (sl ? sl.label.length + 3 : 0)
    let h = wrapText(
      stripConsoleFormatting(data.message),
      contentWidth - prefixWidth,
      contentWidth - TIMESTAMP_WIDTH
    ).length

    if (isSelected) {
      const stack =
        data.stack ||
        (data.rawStack ? parseStack(data.rawStack).stackLines : [])
      if (data.location || stack.length) h += 1
      h += Math.min(stack.length, 10)
      if (stack.length > 10) h += 1
    }

    return h
  }

  // Generic text-based logs
  const sl = getSourceLabel(log.source)
  const prefixWidth = TIMESTAMP_WIDTH + (sl ? sl.label.length + 3 : 0)
  let h = wrapText(
    log.message,
    contentWidth - prefixWidth,
    contentWidth - TIMESTAMP_WIDTH
  ).length

  if (isSelected) {
    h += log.extraLines?.length || 0
  }

  return h
}

// === Main Component ===

export function LogPanel({
  logs,
  logFilter,
  selectedIndex,
  terminalHeight,
  terminalWidth,
  compilationState,
  compileStartTime,
  copied,
}: LogPanelProps) {
  const isCompiling = compilationState?.loading && compileStartTime

  // Content width: terminal width - LogPanel border (2) - LogPanel padding (2) - selection indicator (1)
  const contentWidth = (terminalWidth || 80) - 5
  // Available lines for log entries (terminal - header - border top/bottom - filter bar - filter padding)
  const availableHeight = (terminalHeight || 24) - 6
  const logAreaHeight = Math.max(1, availableHeight - (isCompiling ? 1 : 0))

  // Base heights (unselected) — stable across selection changes
  const baseHeights = useMemo(
    () =>
      logs.map((log) =>
        estimateLogHeight(log, false, contentWidth, logAreaHeight)
      ),
    [logs, contentWidth, logAreaHeight]
  )

  // Only recompute the selected entry's expanded height
  const selectedHeight = useMemo(() => {
    if (selectedIndex < 0 || selectedIndex >= logs.length) return 0
    return estimateLogHeight(
      logs[selectedIndex],
      true,
      contentWidth,
      logAreaHeight
    )
  }, [logs, selectedIndex, contentWidth, logAreaHeight])

  // Scroll offset persisted across renders to avoid jumpy scrolling
  const scrollOffsetRef = useRef(0)

  const { renderStart, renderEnd } = useMemo(() => {
    if (logs.length === 0) return { renderStart: 0, renderEnd: 0 }

    const sel =
      selectedIndex >= 0 && selectedIndex < logs.length
        ? selectedIndex
        : logs.length - 1
    let offset = scrollOffsetRef.current

    const h = (i: number) => (i === sel ? selectedHeight : baseHeights[i])

    // Clamp to valid range
    offset = Math.max(0, Math.min(offset, logs.length - 1))

    // Ensure selected item is visible
    if (sel < offset) offset = sel

    let cumHeight = 0
    for (let i = offset; i <= sel; i++) cumHeight += h(i)
    while (cumHeight > logAreaHeight && offset < sel) {
      cumHeight -= h(offset)
      offset++
    }

    // Compute how many entries fit
    let usedHeight = 0
    let end = offset
    while (end < logs.length && usedHeight + h(end) <= logAreaHeight) {
      usedHeight += h(end)
      end++
    }

    // Always include the selected entry even if it fills the whole viewport
    if (end <= sel) {
      offset = sel
      end = sel + 1
      usedHeight = h(sel)
    }

    // Fill upward with remaining space
    let remaining = logAreaHeight - usedHeight
    while (offset > 0 && h(offset - 1) <= remaining) {
      offset--
      remaining -= h(offset)
    }

    scrollOffsetRef.current = offset
    return { renderStart: offset, renderEnd: end }
  }, [logs, baseHeights, selectedIndex, selectedHeight, logAreaHeight])

  const visibleLogs = useMemo(
    () => logs.slice(renderStart, renderEnd),
    [logs, renderStart, renderEnd]
  )

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      <FilterBar filter={logFilter} copied={copied} />
      {visibleLogs.length === 0 && !isCompiling ? (
        <Box justifyContent="center" paddingY={1}>
          <Text dimColor>
            {logFilter === 'all'
              ? 'Waiting for activity...'
              : logFilter === 'browser'
                ? 'No browser logs to show'
                : `No ${logFilter} to show`}
          </Text>
        </Box>
      ) : (
        <>
          {visibleLogs.map((log, index) => {
            const isSelected = renderStart + index === selectedIndex
            return (
              <LogEntry
                key={log.id}
                log={log}
                isSelected={isSelected}
                contentWidth={contentWidth}
                maxHeight={isSelected ? logAreaHeight : undefined}
              />
            )
          })}
          {isCompiling && (
            <CompilationIndicator
              trigger={compilationState.trigger}
              startTime={compileStartTime}
            />
          )}
        </>
      )}
    </Box>
  )
}
