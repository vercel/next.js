import * as React from 'react'
const { useMemo, useState, useEffect } = React
import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type {
  TuiLogEntry,
  LogFilter,
  FetchMetricData,
  CompilationState,
} from '../types'

interface LogPanelProps {
  logs: TuiLogEntry[]
  logFilter: LogFilter
  selectedIndex: number
  terminalWidth: number
  compilationState?: CompilationState
}

type RequestCategory =
  | 'page'
  | 'api'
  | 'static'
  | 'hmr'
  | 'rsc'
  | 'fetch'
  | 'other'

interface ParsedLog {
  type:
    | 'request'
    | 'compile'
    | 'ready'
    | 'error'
    | 'warning'
    | 'info'
    | 'fetch'
    | 'cache'
  source: string
  // Request fields
  method?: string
  path?: string
  url?: string
  status?: number
  totalTime?: string
  compileTime?: string
  renderTime?: string
  category?: RequestCategory
  routeName?: string
  cacheStatus?: string
  // Compile fields
  trigger?: string
  // Error/warning fields
  message?: string
  file?: string
  line?: number
  column?: number
}

// Parse raw stack trace lazily (for server console logs)
function parseRawStack(stack: string): {
  location?: string
  stackLines: string[]
} {
  const lines = stack.split('\n').slice(1) // Skip "Error" line
  const stackLines: string[] = []
  let location: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip internal frames
    if (
      trimmed.includes('node:') ||
      trimmed.includes('webpack') ||
      trimmed.includes('node_modules') ||
      trimmed.includes('console-file.tsx')
    ) {
      continue
    }

    // Extract location: "at fn (file:line:col)" or "at file:line:col"
    const match = trimmed.match(/at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?$/)
    if (match) {
      const [, file, ln, col] = match
      let cleanFile = file
        .replace(/^webpack:\/\/[^/]+\//, '')
        .replace(/^\(/, '')
        .replace(/\)$/, '')

      if (
        !cleanFile.includes('node_modules') &&
        !cleanFile.startsWith('node:')
      ) {
        if (!location) {
          location = `${cleanFile}:${ln}:${col}`
        }
        stackLines.push(trimmed)
      }
    }
  }

  return { location, stackLines }
}

function categorizeRequest(path: string): {
  category: RequestCategory
  routeName: string
} {
  // HMR/webpack requests
  if (path.includes('/_next/webpack-hmr') || path.includes('__webpack_hmr')) {
    return { category: 'hmr', routeName: 'Hot Reload' }
  }

  // RSC (React Server Components) requests
  if (path.includes('_rsc') || path.endsWith('.rsc')) {
    const cleanPath = path.replace(/[?].*$/, '').replace('.rsc', '')
    return { category: 'rsc', routeName: `RSC ${cleanPath}` }
  }

  // Static assets
  if (path.startsWith('/_next/static/')) {
    const assetType = path.includes('/chunks/')
      ? 'chunk'
      : path.includes('/css/')
        ? 'css'
        : path.includes('/media/')
          ? 'media'
          : 'asset'
    return { category: 'static', routeName: assetType }
  }

  // Next.js internals
  if (path.startsWith('/_next/')) {
    return { category: 'static', routeName: 'internal' }
  }

  // API routes
  if (path.startsWith('/api/') || path.startsWith('/api?')) {
    const apiPath = path.replace(/[?].*$/, '')
    return { category: 'api', routeName: apiPath }
  }

  // Favicon and other common static files
  if (path.match(/\.(ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$/)) {
    return { category: 'static', routeName: 'asset' }
  }

  // Page routes
  const pagePath = path.replace(/[?].*$/, '') || '/'
  return { category: 'page', routeName: pagePath }
}

function parseLogMessage(message: string): ParsedLog {
  // Parse fetch requests: "GET https://... 200 in 122ms (cache skip)"
  const fetchMatch = message.match(
    /^\s*[│|]?\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(https?:\/\/\S+)\s+(\d+)\s+in\s+(\d+m?s)(?:\s+\((.+)\))?/
  )
  if (fetchMatch) {
    const url = fetchMatch[2]
    // Extract hostname for display
    let routeName: string
    try {
      const urlObj = new URL(url)
      routeName =
        urlObj.hostname +
        urlObj.pathname.slice(0, 30) +
        (urlObj.pathname.length > 30 ? '...' : '')
    } catch {
      routeName = url.slice(0, 50)
    }

    return {
      type: 'fetch',
      source: 'next.js',
      method: fetchMatch[1],
      url,
      status: parseInt(fetchMatch[3], 10),
      totalTime: fetchMatch[4],
      cacheStatus: fetchMatch[5],
      category: 'fetch',
      routeName,
    }
  }

  // Parse cache info: "Cache skipped reason: (...)"
  const cacheMatch = message.match(
    /^\s*[│|]?\s*Cache\s+(\w+)\s+reason:\s*\((.+)\)/
  )
  if (cacheMatch) {
    return {
      type: 'cache',
      source: 'next.js',
      message: `Cache ${cacheMatch[1]}: ${cacheMatch[2]}`,
    }
  }

  // Parse page/API requests: " GET / 200 in 258ms" or with timing breakdown
  const requestMatch = message.match(
    /^\s*(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/\S*)\s+(\d+)\s+(?:in\s+)?(\d+m?s)(?:\s+\((.+)\))?$/
  )
  if (requestMatch) {
    const path = requestMatch[2]
    const { category, routeName } = categorizeRequest(path)

    // Parse timing breakdown if present: "compile: 699ms, proxy.ts: 41ms, render: 264ms"
    let compileTime: string | undefined
    let renderTime: string | undefined
    const timingBreakdown = requestMatch[5]
    if (timingBreakdown) {
      const compileMatch = timingBreakdown.match(/compile:\s*(\d+m?s)/)
      const renderMatch = timingBreakdown.match(/render:\s*(\d+m?s)/)
      compileTime = compileMatch?.[1]
      renderTime = renderMatch?.[1]
    }

    return {
      type: 'request',
      source: 'next.js',
      method: requestMatch[1],
      path,
      status: parseInt(requestMatch[3], 10),
      totalTime: requestMatch[4],
      compileTime,
      renderTime,
      category,
      routeName,
    }
  }

  // Parse "✓ Compiled /page in 34ms" or "Compiled in 34ms"
  const compileWithPathMatch = message.match(
    /[✓]?\s*Compiled\s+(\S+)\s+in\s+(\S+)/
  )
  if (compileWithPathMatch) {
    return {
      type: 'compile',
      source: 'next.js',
      trigger: compileWithPathMatch[1],
      totalTime: compileWithPathMatch[2],
    }
  }

  const compileMatch = message.match(/[✓]?\s*Compiled\s+in\s+(\S+)/)
  if (compileMatch) {
    return { type: 'compile', source: 'next.js', totalTime: compileMatch[1] }
  }

  // Parse "✓ Ready in 354ms" - skip these
  const readyMatch = message.match(/[✓]?\s*Ready\s+in\s+(\S+)/)
  if (readyMatch) {
    return { type: 'ready', source: 'next.js', totalTime: readyMatch[1] }
  }

  // React key warnings: "Each child in a list should have a unique "key" prop."
  if (
    message.includes('unique "key" prop') ||
    message.includes("unique 'key' prop")
  ) {
    const componentMatch = message.match(/using <(\w+)>/)
    return {
      type: 'warning',
      source: 'react',
      message: componentMatch
        ? `Missing key prop in <${componentMatch[1]}>`
        : 'Missing key prop in list',
    }
  }

  // React link/info messages - skip the "Check the..." follow-up lines
  if (message.startsWith('Check the') && message.includes('react.dev')) {
    return { type: 'ready', source: 'react', message } // Use 'ready' to filter it out
  }

  // Inspector/debugger noise
  if (message.includes('inspector') || message.includes('Debugger listening')) {
    return { type: 'ready', source: 'node', message } // Filter out
  }

  // Errors with file location: "⨯ ./app/page.tsx (10:5)"
  const errorWithFileMatch = message.match(
    /^⨯\s*(.+?)\s*\((\d+):(\d+)\)\s*(.*)$/
  )
  if (errorWithFileMatch) {
    return {
      type: 'error',
      source: 'next.js',
      file: errorWithFileMatch[1],
      line: parseInt(errorWithFileMatch[2], 10),
      column: parseInt(errorWithFileMatch[3], 10),
      message: errorWithFileMatch[4] || errorWithFileMatch[1],
    }
  }

  // Generic errors
  if (message.startsWith('⨯')) {
    return {
      type: 'error',
      source: 'next.js',
      message: message.replace(/^⨯\s*/, ''),
    }
  }

  // Port in use warning
  const portMatch = message.match(/Port (\d+) is in use.*using.*port (\d+)/)
  if (portMatch) {
    return {
      type: 'warning',
      source: 'next.js',
      message: `Port ${portMatch[1]} busy, using ${portMatch[2]}`,
    }
  }

  // Warnings with file location
  const warnWithFileMatch = message.match(
    /^⚠\s*(.+?)\s*\((\d+):(\d+)\)\s*(.*)$/
  )
  if (warnWithFileMatch) {
    return {
      type: 'warning',
      source: 'next.js',
      file: warnWithFileMatch[1],
      line: parseInt(warnWithFileMatch[2], 10),
      column: parseInt(warnWithFileMatch[3], 10),
      message: warnWithFileMatch[4] || warnWithFileMatch[1],
    }
  }

  // Generic warnings
  if (message.startsWith('⚠')) {
    return {
      type: 'warning',
      source: 'next.js',
      message: message.replace(/^⚠\s*/, ''),
    }
  }

  return { type: 'info', source: 'app', message }
}

function getStatusColor(status: number): string {
  if (status >= 500) return 'red'
  if (status >= 400) return 'yellow'
  if (status >= 300) return 'cyan'
  return 'green'
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

function getCategoryColor(category: RequestCategory): string {
  switch (category) {
    case 'page':
      return 'green'
    case 'api':
      return 'blue'
    case 'rsc':
      return 'magenta'
    case 'static':
      return 'gray'
    case 'hmr':
      return 'yellow'
    default:
      return 'white'
  }
}

function formatUrlForDisplay(url: string, maxLength: number = 40): string {
  try {
    const urlObj = new URL(url)
    const display = urlObj.hostname + urlObj.pathname
    if (display.length > maxLength) {
      return display.slice(0, maxLength - 2) + '..'
    }
    return display
  } catch {
    return url.slice(0, maxLength)
  }
}

// Detailed fetch metrics (only shown when selected)
function FetchMetricsSummary({ fetches }: { fetches: FetchMetricData[] }) {
  const cached = fetches.filter(
    (f) => f.cacheStatus === 'hit' || f.cacheStatus === 'hmr'
  )
  const uncached = fetches.filter(
    (f) => f.cacheStatus === 'skip' || f.cacheStatus === 'miss'
  )
  const uncachedTime = uncached.reduce((sum, f) => sum + f.totalTime, 0)

  // Check if all fetches share the same host
  let commonHost: string | null = null
  try {
    const hosts = new Set(fetches.map((f) => new URL(f.url).hostname))
    if (hosts.size === 1) {
      commonHost = Array.from(hosts)[0]
    }
  } catch {}

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor> ↳ </Text>
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
        {commonHost && <Text dimColor> · {commonHost}</Text>}
      </Box>
      {fetches.map((fetch, i) => {
        const cacheColor =
          fetch.cacheStatus === 'hit' || fetch.cacheStatus === 'hmr'
            ? 'green'
            : 'yellow'
        let path: string
        try {
          const urlObj = new URL(fetch.url)
          path = urlObj.pathname + urlObj.search
          if (path.length > 40) path = path.slice(0, 37) + '..'
        } catch {
          path = fetch.url.slice(0, 40)
        }

        return (
          <Box key={i}>
            <Text dimColor> {i === fetches.length - 1 ? '└' : '├'} </Text>
            <Text color={cacheColor}>
              {fetch.cacheStatus === 'hit' || fetch.cacheStatus === 'hmr'
                ? '●'
                : '○'}{' '}
            </Text>
            <Text dimColor>{path} </Text>
            <Text>{fetch.totalTime}ms</Text>
            {fetch.cacheReason && (
              <Text color="yellow" dimColor>
                {' '}
                ← {fetch.cacheReason}
              </Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}

function LogEntry({
  log,
  isSelected,
  terminalWidth: _terminalWidth,
}: {
  log: TuiLogEntry
  isSelected: boolean
  terminalWidth: number
}) {
  const timestamp = formatTimestamp(log.timestamp)

  // Wrapper that adds border when selected
  const SelectionWrapper = ({ children }: { children: React.ReactNode }) => {
    if (isSelected) {
      return (
        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          flexDirection="column"
        >
          {children}
        </Box>
      )
    }
    return <Box paddingLeft={2}>{children}</Box>
  }

  // If we have structured data, render it directly (no string parsing)
  if (log.structured) {
    const data = log.structured

    if (data.type === 'request') {
      const statusColor = getStatusColor(data.status)
      const { category, routeName } = categorizeRequest(data.url)
      const routeColor = getCategoryColor(category)

      // Find compile and render times from timings
      const compileTime = data.timings?.find((t) => t.label === 'compile')
      const renderTime = data.timings?.find((t) => t.label === 'render')

      // Simple fetch indicator for unselected state
      const fetchCount = data.fetchMetrics?.length || 0
      const uncachedFetches =
        data.fetchMetrics?.filter(
          (f) => f.cacheStatus === 'skip' || f.cacheStatus === 'miss'
        ) || []
      const fetchWarnings =
        data.fetchMetrics?.filter((f) => f.cacheWarning) || []

      // Request type: use minimal indicators
      const isAction = data.requestType === 'action'
      const isNav = data.requestType === 'nav'

      // Type indicator: none for load, → for nav, ƒ for action
      let typeIndicator: string | null = null
      let typeColor: string = 'green'
      if (isAction) {
        typeIndicator = 'ƒ'
        typeColor = 'magenta'
      } else if (isNav) {
        typeIndicator = '→'
        typeColor = 'cyan'
      }

      // For actions, show file#functionName() format
      let displayRouteName = routeName
      if (isAction && data.actionName) {
        if (data.actionFile) {
          // Extract just the filename without extension
          const fileName =
            data.actionFile
              .split('/')
              .pop()
              ?.replace(/\.(ts|tsx|js|jsx)$/, '') || data.actionFile
          displayRouteName = `${fileName}#${data.actionName}()`
        } else {
          displayRouteName = `${data.actionName}()`
        }
      }

      return (
        <SelectionWrapper>
          <Box flexDirection="column">
            <Box>
              <Text dimColor={!isSelected}>{timestamp} </Text>
              <Text color={statusColor} bold={isSelected}>
                {data.status}{' '}
              </Text>
              <Text dimColor={!isSelected}>{data.method} </Text>
              {typeIndicator && (
                <Text color={typeColor} dimColor={!isSelected}>
                  {typeIndicator}{' '}
                </Text>
              )}
              <Text
                color={isAction ? 'magenta' : routeColor}
                bold={isSelected}
                dimColor={!isSelected}
              >
                {displayRouteName}{' '}
              </Text>
              <Text dimColor={!isSelected} bold={isSelected}>
                {data.totalTime}ms
              </Text>
              {/* Compact indicators when not selected */}
              {!isSelected && (
                <>
                  {fetchCount > 0 && (
                    <>
                      <Text dimColor>
                        {' '}
                        · {fetchCount} fetch{fetchCount > 1 ? 'es' : ''}
                      </Text>
                      {uncachedFetches.length > 0 && (
                        <Text color="yellow" dimColor>
                          {' '}
                          ({uncachedFetches.length} uncached)
                        </Text>
                      )}
                    </>
                  )}
                  {fetchWarnings.length > 0 && (
                    <Text color="yellow" dimColor>
                      {' '}
                      · {fetchWarnings.length} warning
                      {fetchWarnings.length > 1 ? 's' : ''}
                    </Text>
                  )}
                </>
              )}
            </Box>
            {/* Show details only when selected */}
            {isSelected && (
              <>
                {compileTime && renderTime && (
                  <Box>
                    <Text dimColor>
                      {' '}
                      {isAction ||
                      (data.fetchMetrics && data.fetchMetrics.length > 0)
                        ? '├'
                        : '└'}{' '}
                      {compileTime.time}ms build + {renderTime.time}ms render
                    </Text>
                  </Box>
                )}
                {isAction && (
                  <Box flexDirection="column">
                    {data.actionFile && (
                      <Box>
                        <Text dimColor> ├ defined in </Text>
                        <Text>{data.actionFile}</Text>
                      </Box>
                    )}
                    <Box>
                      <Text dimColor> └ called from </Text>
                      <Text>{routeName}</Text>
                    </Box>
                  </Box>
                )}
                {data.fetchMetrics && data.fetchMetrics.length > 0 && (
                  <FetchMetricsSummary fetches={data.fetchMetrics} />
                )}
              </>
            )}
          </Box>
        </SelectionWrapper>
      )
    }

    if (data.type === 'fetch') {
      const statusColor = getStatusColor(data.status)
      const displayUrl = formatUrlForDisplay(data.url)
      const cacheColor =
        data.cacheStatus === 'hit' || data.cacheStatus === 'hmr'
          ? 'green'
          : 'yellow'

      return (
        <SelectionWrapper>
          <Box flexDirection="column">
            <Box>
              <Text dimColor={!isSelected}>{timestamp} </Text>
              <Text color={statusColor} bold={isSelected}>
                {data.status}{' '}
              </Text>
              <Text dimColor={!isSelected}>{data.method} </Text>
              <Text color="blue" bold={isSelected} dimColor={!isSelected}>
                {displayUrl}{' '}
              </Text>
              <Text dimColor={!isSelected} bold={isSelected}>
                {data.totalTime}ms
              </Text>
              {data.cacheStatus && (
                <Text color={cacheColor} dimColor={!isSelected}>
                  {' '}
                  ({data.cacheStatus})
                </Text>
              )}
              {data.cacheReason &&
                (data.cacheStatus === 'skip' ||
                  data.cacheStatus === 'miss') && (
                  <Text color="yellow" dimColor={!isSelected}>
                    {' '}
                    ← {data.cacheReason}
                  </Text>
                )}
            </Box>
            {data.cacheWarning && (
              <Box>
                <Text color="yellow">⚠ {data.cacheWarning}</Text>
              </Box>
            )}
          </Box>
        </SelectionWrapper>
      )
    }

    // Console logs from browser or server
    if (data.type === 'console') {
      const methodColor =
        data.method === 'error'
          ? 'red'
          : data.method === 'warn'
            ? 'yellow'
            : 'white'
      const sourceLabel = data.source === 'browser' ? 'browser' : 'server'
      const sourceColor = data.source === 'browser' ? 'blue' : 'cyan'

      // Parse rawStack lazily only when selected (for server logs)
      let location = data.location
      let stackLines = data.stack
      if (isSelected && data.rawStack && !data.stack) {
        const parsed = parseRawStack(data.rawStack)
        location = parsed.location
        stackLines = parsed.stackLines
      }

      // For inline display, parse just the location if needed
      if (!isSelected && !location && data.rawStack) {
        const parsed = parseRawStack(data.rawStack)
        location = parsed.location
      }

      return (
        <SelectionWrapper>
          <Box flexDirection="column">
            <Box>
              <Text dimColor={!isSelected}>{timestamp} </Text>
              <Text color={sourceColor} dimColor={!isSelected}>
                [{sourceLabel}]{' '}
              </Text>
              <Text
                color={methodColor}
                bold={isSelected}
                dimColor={!isSelected}
              >
                {data.message}
              </Text>
              {location && !isSelected && <Text dimColor> ({location})</Text>}
            </Box>
            {/* Show location and stack when selected */}
            {isSelected && (
              <>
                {location && (
                  <Box>
                    <Text dimColor> └ </Text>
                    <Text>{location}</Text>
                  </Box>
                )}
                {stackLines && stackLines.length > 0 && (
                  <Box flexDirection="column" paddingLeft={4}>
                    {stackLines.slice(0, 10).map((line, i) => (
                      <Text key={i} dimColor>
                        {line}
                      </Text>
                    ))}
                    {stackLines.length > 10 && (
                      <Text dimColor>
                        ... {stackLines.length - 10} more frames
                      </Text>
                    )}
                  </Box>
                )}
              </>
            )}
          </Box>
        </SelectionWrapper>
      )
    }
  }

  // Fall back to parsing string message
  let fullMessage = log.message
  if (log.extraLines?.length) {
    const timingContinuation = log.extraLines.find(
      (line) => line.match(/^\s*\d+m?s\)/) || line.match(/^\s*\w+:\s*\d+m?s/)
    )
    if (timingContinuation) {
      fullMessage = log.message + ' ' + log.extraLines.join(' ')
    }
  }
  const parsed = parseLogMessage(fullMessage)

  const renderContent = () => {
    switch (parsed.type) {
      case 'request': {
        const statusColor = getStatusColor(parsed.status || 200)
        const routeColor = getCategoryColor(parsed.category || 'other')

        return (
          <Box>
            <Text dimColor={!isSelected}>{timestamp} </Text>
            <Text color={statusColor} bold={isSelected}>
              {parsed.status}{' '}
            </Text>
            <Text dimColor={!isSelected}>{parsed.method} </Text>
            <Text color={routeColor} bold={isSelected} dimColor={!isSelected}>
              {parsed.routeName}{' '}
            </Text>
            <Text dimColor={!isSelected} bold={isSelected}>
              {parsed.totalTime}
            </Text>
            {parsed.compileTime && parsed.renderTime && (
              <Text dimColor={!isSelected}>
                {' '}
                ({parsed.compileTime} build, {parsed.renderTime} render)
              </Text>
            )}
          </Box>
        )
      }

      case 'fetch': {
        const statusColor = getStatusColor(parsed.status || 200)
        const cacheColor =
          parsed.cacheStatus === 'hit' || parsed.cacheStatus === 'hmr'
            ? 'green'
            : 'yellow'
        return (
          <Box>
            <Text dimColor={!isSelected}>{timestamp} </Text>
            <Text color={statusColor} bold={isSelected}>
              {parsed.status}{' '}
            </Text>
            <Text dimColor={!isSelected}>{parsed.method} </Text>
            <Text color="blue" bold={isSelected} dimColor={!isSelected}>
              {parsed.routeName}{' '}
            </Text>
            <Text dimColor={!isSelected} bold={isSelected}>
              {parsed.totalTime}
            </Text>
            {parsed.cacheStatus && (
              <Text color={cacheColor} dimColor={!isSelected}>
                {' '}
                ({parsed.cacheStatus})
              </Text>
            )}
          </Box>
        )
      }

      case 'compile':
        return (
          <Box>
            <Text dimColor={!isSelected}>{timestamp} </Text>
            <Text color="green" dimColor={!isSelected}>
              ○{' '}
            </Text>
            <Text color="green" bold={isSelected} dimColor={!isSelected}>
              Compiled{' '}
            </Text>
            {parsed.trigger && (
              <Text
                dimColor={!isSelected}
                color={isSelected ? 'white' : undefined}
              >
                {parsed.trigger}{' '}
              </Text>
            )}
            <Text dimColor={!isSelected} bold={isSelected}>
              {parsed.totalTime}
            </Text>
          </Box>
        )

      case 'error': {
        const cleanMessage = (parsed.message || '').replace(/⨯\s*/g, '').trim()

        return (
          <Box flexDirection="column">
            <Box>
              <Text dimColor={!isSelected}>{timestamp} </Text>
              <Text color="red" bold>
                ⨯ Error:{' '}
              </Text>
              {parsed.file ? (
                <Text color="red" dimColor={!isSelected}>
                  {parsed.file}:{parsed.line}:{parsed.column}
                </Text>
              ) : (
                <Text color="red" dimColor={!isSelected}>
                  {cleanMessage}
                </Text>
              )}
            </Box>
            {log.extraLines?.map((line, i) => (
              <Box key={i} paddingLeft={2}>
                <Text
                  color={line.startsWith('http') ? 'cyan' : 'red'}
                  dimColor={!isSelected}
                >
                  {line}
                </Text>
              </Box>
            ))}
          </Box>
        )
      }

      case 'warning': {
        const cleanMessage = (parsed.message || '').replace(/⚠\s*/g, '').trim()

        return (
          <Box flexDirection="column">
            <Box>
              <Text dimColor={!isSelected}>{timestamp} </Text>
              <Text color="yellow" bold>
                ⚠ Warning:{' '}
              </Text>
              {parsed.file ? (
                <Text color="yellow" dimColor={!isSelected}>
                  {parsed.file}:{parsed.line}:{parsed.column}
                </Text>
              ) : (
                <Text color="yellow" dimColor={!isSelected}>
                  {cleanMessage}
                </Text>
              )}
            </Box>
            {log.extraLines?.map((line, i) => (
              <Box key={i} paddingLeft={2}>
                <Text
                  color={line.startsWith('http') ? 'cyan' : 'yellow'}
                  dimColor={!isSelected}
                >
                  {line}
                </Text>
              </Box>
            ))}
          </Box>
        )
      }

      default:
        // Check if this is a userland/browser log (fallback for non-structured logs)
        const isUserland = log.source === 'userland' || log.source === 'browser'
        const sourceLabel =
          log.source === 'browser' ? 'browser' : isUserland ? 'server' : null
        const sourceColor = log.source === 'browser' ? 'blue' : 'cyan'

        return (
          <Box flexDirection="column">
            <Box>
              <Text dimColor={!isSelected}>{timestamp} </Text>
              {sourceLabel && (
                <Text color={sourceColor} dimColor={!isSelected}>
                  [{sourceLabel}]{' '}
                </Text>
              )}
              <Text dimColor={!isSelected}>{parsed.message}</Text>
            </Box>
            {/* Show extra lines (including stacktrace) when selected */}
            {isSelected &&
              log.extraLines &&
              log.extraLines.length > 0 &&
              log.extraLines.map((line, i) => (
                <Box key={i} paddingLeft={2}>
                  <Text dimColor>{line}</Text>
                </Box>
              ))}
          </Box>
        )
    }
  }

  return <SelectionWrapper>{renderContent()}</SelectionWrapper>
}

function shouldShowLog(log: TuiLogEntry): boolean {
  const msg = log.message
  const parsed = parseLogMessage(msg)

  // Skip ready messages (also used to filter noise)
  if (parsed.type === 'ready') return false

  // Skip startup noise
  if (
    msg.includes('Next.js') ||
    msg.includes('Local:') ||
    msg.includes('Network:') ||
    msg.includes('Debugger port:') ||
    msg.includes('Environments:') ||
    msg.includes('Experiments') ||
    msg.match(/^\s*[-▲✓]\s*(Starting|Local|Network)/) ||
    msg.match(/^\s*[✓]\s*(inlineCss|mdxRs|ppr|reactCompiler)/) // Experiment flags
  ) {
    return false
  }

  return true
}

function matchesFilter(log: TuiLogEntry, filter: LogFilter): boolean {
  // First check if log should be shown at all
  if (!shouldShowLog(log)) return false

  if (filter === 'all') return true

  // Console filter shows userland logs
  if (filter === 'console') {
    return log.source === 'userland' || log.source === 'browser'
  }

  // Other filters apply to system logs
  const parsed = parseLogMessage(log.message)
  switch (filter) {
    case 'errors':
      return parsed.type === 'error'
    case 'warnings':
      return parsed.type === 'warning' || parsed.type === 'error'
    case 'requests':
      return parsed.type === 'request' || log.structured?.type === 'request'
    default:
      return true
  }
}

function FilterBar({ filter }: { filter: LogFilter }) {
  const filters: { key: string; label: string; value: LogFilter }[] = [
    { key: 'a', label: 'all', value: 'all' },
    { key: 'r', label: 'req', value: 'requests' },
    { key: 'l', label: 'log', value: 'console' },
    { key: 'w', label: 'warn', value: 'warnings' },
    { key: 'e', label: 'err', value: 'errors' },
  ]

  return (
    <Box paddingBottom={1}>
      {filters.map((f, i) => (
        <React.Fragment key={f.value}>
          {i > 0 && <Text dimColor> </Text>}
          <Text
            color={filter === f.value ? 'cyan' : 'gray'}
            bold={filter === f.value}
            dimColor={filter !== f.value}
          >
            [{f.key}]{f.label}
          </Text>
        </React.Fragment>
      ))}
      <Box flexGrow={1} />
      <Text dimColor>←→ filter | ↑↓ select | c copy | f follow | q quit</Text>
    </Box>
  )
}

// Inline compilation indicator with elapsed timer
function CompilationIndicator({
  trigger,
  startTime,
}: {
  trigger?: string
  startTime: number
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime)
    }, 100)
    return () => clearInterval(interval)
  }, [startTime])

  const seconds = (elapsed / 1000).toFixed(1)

  return (
    <Box paddingLeft={2}>
      <Text color="cyan">
        <Spinner type="dots" />
      </Text>
      <Text color="cyan"> Compiling</Text>
      {trigger && <Text color="cyan"> {trigger}</Text>}
      <Text dimColor>... {seconds}s</Text>
    </Box>
  )
}

export function LogPanel({
  logs,
  logFilter,
  selectedIndex,
  terminalWidth,
  compilationState,
}: LogPanelProps) {
  // Track when compilation started for timer
  const [compileStartTime, setCompileStartTime] = useState<number | null>(null)

  useEffect(() => {
    if (compilationState?.loading && !compileStartTime) {
      setCompileStartTime(Date.now())
    } else if (!compilationState?.loading) {
      setCompileStartTime(null)
    }
  }, [compilationState?.loading, compileStartTime])

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => matchesFilter(log, logFilter)).slice(-50)
  }, [logs, logFilter])

  const isCompiling = compilationState?.loading && compileStartTime

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle="round"
      borderColor="gray"
      paddingX={1}
    >
      <FilterBar filter={logFilter} />
      {filteredLogs.length === 0 && !isCompiling ? (
        <Box justifyContent="center" paddingY={1}>
          <Text dimColor>
            {logFilter === 'all'
              ? 'Waiting for activity...'
              : `No ${logFilter} to show`}
          </Text>
        </Box>
      ) : (
        <>
          {filteredLogs.map((log, index) => (
            <LogEntry
              key={`${log.timestamp}-${index}`}
              log={log}
              isSelected={index === selectedIndex}
              terminalWidth={terminalWidth}
            />
          ))}
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
