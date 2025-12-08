/**
 * Waterfall Detection for Next.js Profiler Builds
 *
 * This module detects fetch waterfalls during initial page load by:
 * 1. Patching globalThis.fetch with artificial delays to amplify timing relationships
 * 2. Hooking into React DevTools to track commits
 * 3. Analyzing the timeline to find: fetch.end → commit → fetch.start chains
 *
 * Only active when process.env.__NEXT_PROFILER_BUILD is true
 */

interface StackFrame {
  functionName: string
  fileName: string
  lineNumber: number
  columnNumber: number
  raw: string
}

interface FetchEvent {
  id: number
  url: string
  startTime: number
  endTime: number
  artificialDelay: number
  stackTrace: string
  error: Error // Store the actual Error object for browser DevTools
  parsedFrames: StackFrame[]
}

interface CommitEvent {
  time: number
}

// Configuration
const BASE_DELAY = 1000 // First fetch gets 1s delay
const DELAY_INCREMENT = 500 // Each subsequent fetch gets 500ms more
const PROXIMITY_THRESHOLD = 100 // ms to consider events causally related
const IDLE_TIMEOUT = 3000 // Consider page idle after 3s of no activity
const POST_FETCH_SETTLE_TIME = 500 // Wait after fetch completes for React to potentially trigger new fetches
const MAX_ANALYSIS_WINDOW = 60000 // Stop analyzing after 60s regardless

// State
let fetchCounter = 0
let pendingFetches = 0 // Track in-flight fetches
const fetchEvents: FetchEvent[] = []
const commitEvents: CommitEvent[] = []
let idleTimer: ReturnType<typeof setTimeout> | null = null
let settleTimer: ReturnType<typeof setTimeout> | null = null // Wait for React to potentially trigger new fetches
let maxWindowTimer: ReturnType<typeof setTimeout> | null = null
let hasAnalyzed = false
let isInitialLoad = true
let isInitialized = false
const originalFetch = globalThis.fetch

// Styled console logging
const logStyles = {
  detector:
    'background: #ff6b6b; color: white; padding: 2px 6px; border-radius: 3px;',
  success:
    'background: #51cf66; color: white; padding: 2px 6px; border-radius: 3px;',
  warning:
    'background: #fcc419; color: black; padding: 2px 6px; border-radius: 3px;',
  url: 'color: #228be6; font-weight: bold;',
  normal: 'color: inherit;',
}

function log(message: string, style: keyof typeof logStyles = 'detector') {
  console.log(`%c[Waterfall Detector]%c ${message}`, logStyles[style], '')
}

/**
 * Patch globalThis.fetch to:
 * - Add artificial delays that increase with each fetch
 * - Capture stack traces
 * - Record timing information
 */
function patchFetch() {
  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // Skip if we've already analyzed or this isn't initial load
    if (hasAnalyzed || !isInitialLoad) {
      return originalFetch.call(globalThis, input, init)
    }

    const id = fetchCounter++
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    // Skip internal Next.js requests
    if (url.includes('/_next/') || url.includes('__nextjs')) {
      return originalFetch.call(globalThis, input, init)
    }

    const delay = BASE_DELAY + id * DELAY_INCREMENT
    // Capture stack trace synchronously BEFORE any await
    const {
      error,
      stack: stackTrace,
      frames: parsedFrames,
    } = captureStackTrace()
    const startTime = performance.now()

    // Track pending fetch
    pendingFetches++

    console.log(
      `%c[Waterfall Detector]%c Fetch #${id} started: %c${truncateUrl(url)}`,
      logStyles.detector,
      logStyles.normal,
      logStyles.url
    )

    try {
      // Actually perform the fetch
      const result = await originalFetch.call(globalThis, input, init)

      // Apply artificial delay AFTER response arrives
      // This amplifies the timing relationship between fetches
      console.log(
        `%c[Waterfall Detector]%c Fetch #${id} response received, applying ${delay}ms artificial delay...`,
        logStyles.detector,
        logStyles.normal
      )
      await new Promise((resolve) => setTimeout(resolve, delay))

      const endTime = performance.now()

      fetchEvents.push({
        id,
        url,
        startTime,
        endTime,
        artificialDelay: delay,
        stackTrace,
        error,
        parsedFrames,
      })

      console.log(
        `%c[Waterfall Detector]%c Fetch #${id} completed (total: ${(endTime - startTime).toFixed(0)}ms)`,
        logStyles.detector,
        logStyles.normal
      )

      // Fetch completed - decrement pending and start idle timer
      pendingFetches--
      resetIdleTimer()

      return result
    } catch (err) {
      // Still record failed fetches
      const endTime = performance.now()
      fetchEvents.push({
        id,
        url,
        startTime,
        endTime,
        artificialDelay: delay,
        stackTrace,
        error,
        parsedFrames,
      })
      pendingFetches--
      resetIdleTimer()
      throw err
    }
  }
}

/**
 * Hook into React DevTools to track commit events
 */
function setupReactHook() {
  const checkHook = () => {
    const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__

    if (hook) {
      // Store original handler
      const originalOnCommitFiberRoot = hook.onCommitFiberRoot

      hook.onCommitFiberRoot = function (
        rendererID: number,
        root: any,
        priorityLevel?: number
      ) {
        if (!hasAnalyzed && isInitialLoad) {
          const time = performance.now()
          commitEvents.push({ time })
          resetIdleTimer()
        }

        if (originalOnCommitFiberRoot) {
          return originalOnCommitFiberRoot.call(
            this,
            rendererID,
            root,
            priorityLevel
          )
        }
      }

      log('React commit tracking installed')
    } else {
      // React DevTools hook might not be available yet, retry
      setTimeout(checkHook, 50)
    }
  }

  checkHook()
}

/**
 * Reset the idle timer - triggers analysis when page becomes idle
 * Uses a two-phase approach:
 * 1. After fetch completes, wait POST_FETCH_SETTLE_TIME for React to potentially trigger new fetches
 * 2. If no new fetches start, then start the IDLE_TIMEOUT
 */
function resetIdleTimer() {
  if (hasAnalyzed) return

  // Clear any existing timers
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }

  // Don't start any timer if fetches are still in-flight
  if (pendingFetches > 0) {
    return
  }

  // First, wait for settle time to allow React re-renders to trigger new fetches
  settleTimer = setTimeout(() => {
    // After settle time, check again if any fetches started
    if (pendingFetches > 0 || hasAnalyzed) {
      return
    }

    // No new fetches started, now wait for idle timeout
    idleTimer = setTimeout(() => {
      analyzeWaterfalls()
    }, IDLE_TIMEOUT)
  }, POST_FETCH_SETTLE_TIME)
}

/**
 * Analyze the collected fetch and commit events to detect waterfall patterns
 */
async function analyzeWaterfalls() {
  if (hasAnalyzed) return
  hasAnalyzed = true
  isInitialLoad = false

  // Clean up timers
  if (settleTimer) clearTimeout(settleTimer)
  if (idleTimer) clearTimeout(idleTimer)
  if (maxWindowTimer) clearTimeout(maxWindowTimer)

  console.log('')
  console.log(
    '%c[Waterfall Detector]%c Analyzing initial page load...',
    logStyles.detector,
    logStyles.normal
  )
  console.log(`  Total fetches recorded: ${fetchEvents.length}`)
  console.log(`  Total React commits recorded: ${commitEvents.length}`)

  if (fetchEvents.length === 0) {
    console.log(
      '%c[Waterfall Detector] No client-side fetches detected!',
      'background: #51cf66; color: white; padding: 4px 8px; border-radius: 4px; font-size: 14px;'
    )
    console.log('')
    console.log('  No data fetches were made during initial page load.')
    console.log('  This is ideal - all data is being fetched on the server.')

    // Send report to server
    sendReportToServer({
      type: 'no-fetches',
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: Date.now(),
      totalFetches: 0,
      totalCommits: commitEvents.length,
      renderTriggeringFetches: [],
      waterfallChains: [],
    })
    return
  }

  // Resolve source maps for all fetch events
  console.log('  Resolving source maps for stack traces...')
  for (const fetchEvent of fetchEvents) {
    try {
      fetchEvent.parsedFrames = await resolveStackFrames(
        fetchEvent.parsedFrames
      )
    } catch (e) {
      // Keep original frames on error
    }
  }

  // Sort events by time
  fetchEvents.sort((a, b) => a.startTime - b.startTime)
  commitEvents.sort((a, b) => a.time - b.time)

  // First, identify fetches that have an associated React commit
  // (fetch.end → commit within threshold means this fetch triggered a re-render)
  const fetchesWithCommits = new Set<number>()
  for (const fetchEvent of fetchEvents) {
    const hasRelatedCommit = commitEvents.some(
      (commit) =>
        commit.time >= fetchEvent.endTime &&
        commit.time - fetchEvent.endTime <= PROXIMITY_THRESHOLD
    )
    if (hasRelatedCommit) {
      fetchesWithCommits.add(fetchEvent.id)
    }
  }

  // Build waterfall chains using the causal relationship:
  // fetch.end → commit within threshold → fetch.start within threshold
  const chains: FetchEvent[][] = []
  const processedFetchIds = new Set<number>()

  for (const fetch of fetchEvents) {
    if (processedFetchIds.has(fetch.id)) continue
    // Only start chains from fetches that trigger commits
    if (!fetchesWithCommits.has(fetch.id)) continue

    // Start a new chain with this fetch
    const chain: FetchEvent[] = [fetch]
    processedFetchIds.add(fetch.id)

    let currentFetchEndTime = fetch.endTime

    // Try to extend the chain
    while (true) {
      // Find a commit that happened shortly after this fetch ended
      let relatedCommit: CommitEvent | undefined
      for (let i = 0; i < commitEvents.length; i++) {
        const commit = commitEvents[i]
        if (
          commit.time >= currentFetchEndTime &&
          commit.time - currentFetchEndTime <= PROXIMITY_THRESHOLD
        ) {
          relatedCommit = commit
          break
        }
      }

      if (!relatedCommit) break

      // Find a fetch that started shortly after that commit
      let nextFetch: FetchEvent | undefined
      for (let i = 0; i < fetchEvents.length; i++) {
        const f = fetchEvents[i]
        if (
          !processedFetchIds.has(f.id) &&
          f.startTime >= relatedCommit.time &&
          f.startTime - relatedCommit.time <= PROXIMITY_THRESHOLD
        ) {
          nextFetch = f
          break
        }
      }

      if (!nextFetch) break

      // Found a causal chain!
      chain.push(nextFetch)
      processedFetchIds.add(nextFetch.id)
      currentFetchEndTime = nextFetch.endTime
    }

    // Only report chains with 2+ fetches (actual waterfalls)
    if (chain.length > 1) {
      chains.push(chain)
    }
  }

  // Count fetches that triggered renders (these are the ones we care about)
  const renderTriggeringFetches = fetchEvents.filter((f) =>
    fetchesWithCommits.has(f.id)
  )

  // Output results
  console.log('')
  console.log(
    `  Fetches that triggered React renders: ${renderTriggeringFetches.length}`
  )

  if (chains.length === 0 && renderTriggeringFetches.length === 0) {
    console.log(
      '%c[Waterfall Detector] No render-blocking fetches detected!',
      'background: #51cf66; color: white; padding: 4px 8px; border-radius: 4px; font-size: 14px;'
    )
    console.log('')
    console.log(
      '  Client-side fetches were made, but none triggered React re-renders.'
    )
    console.log('  No waterfall patterns found.')

    // Send report to server
    sendReportToServer({
      type: 'no-waterfall',
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: Date.now(),
      totalFetches: fetchEvents.length,
      totalCommits: commitEvents.length,
      renderTriggeringFetches: [],
      waterfallChains: [],
    })
  } else if (chains.length === 0 && renderTriggeringFetches.length > 0) {
    // Fetches triggered renders but no waterfall chain detected
    console.log(
      '%c[Waterfall Detector] Render-blocking fetches detected!',
      'background: #fcc419; color: black; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: bold;'
    )
    console.log('')
    console.log(
      `  Found ${renderTriggeringFetches.length} fetch(es) that triggered React re-renders.`
    )
    console.log(
      '  Consider moving data fetching to the server (Server Components, getServerSideProps, etc.)'
    )
    console.log('')

    // List fetches that triggered renders
    renderTriggeringFetches.forEach((fetchEvent, i) => {
      console.log(
        `%c${i + 1}. ${truncateUrl(fetchEvent.url, 80)}`,
        'color: #228be6; font-weight: bold;'
      )

      // Show resolved source location
      const userFrames = filterStackFrames(fetchEvent.parsedFrames)
      if (userFrames.length > 0) {
        const topFrame = userFrames[0]
        console.log(
          `   %c📍 ${topFrame.fileName}:${topFrame.lineNumber}:${topFrame.columnNumber}`,
          'color: #d63384; font-weight: bold;'
        )
        if (topFrame.functionName && topFrame.functionName !== '<anonymous>') {
          console.log(`      in ${topFrame.functionName}()`)
        }
      }
      console.log('')
    })

    // Send report to server
    sendReportToServer({
      type: 'render-blocking',
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: Date.now(),
      totalFetches: fetchEvents.length,
      totalCommits: commitEvents.length,
      renderTriggeringFetches: renderTriggeringFetches.map((f) => ({
        url: f.url,
        stackTrace: f.stackTrace,
        parsedFrames: f.parsedFrames,
      })),
      waterfallChains: [],
    })
  } else {
    console.log(
      '%c[Waterfall Detector] Waterfall patterns detected!',
      'background: #ff6b6b; color: white; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: bold;'
    )
    console.log('')
    console.log(
      `  Found ${chains.length} waterfall chain(s) that may impact performance.`
    )
    console.log(
      '  Consider fetching this data in parallel or at a higher level.'
    )
    console.log('')

    chains.forEach((chain, i) => {
      console.group(
        `%cWaterfall Chain ${i + 1}%c (${chain.length} sequential fetches)`,
        'background: #ff6b6b; color: white; padding: 2px 6px; border-radius: 3px;',
        'color: #ff6b6b; font-weight: bold; margin-left: 8px;'
      )

      chain.forEach((fetchEvent, j) => {
        const isLast = j === chain.length - 1
        const connector = isLast ? '' : ' ↓ triggers'

        console.log('')
        console.log(
          `%c${j + 1}. ${truncateUrl(fetchEvent.url, 80)}%c${connector}`,
          'color: #228be6; font-weight: bold;',
          'color: #868e96; margin-left: 8px;'
        )

        // Show resolved source location
        const userFrames = filterStackFrames(fetchEvent.parsedFrames)
        if (userFrames.length > 0) {
          const topFrame = userFrames[0]
          console.log(
            `   %c📍 ${topFrame.fileName}:${topFrame.lineNumber}:${topFrame.columnNumber}`,
            'color: #d63384; font-weight: bold;'
          )
          if (
            topFrame.functionName &&
            topFrame.functionName !== '<anonymous>'
          ) {
            console.log(`      in ${topFrame.functionName}()`)
          }
        }
      })

      console.log('')
      console.groupEnd()
    })

    // Machine-readable summary for AI agents with resolved source locations
    console.log('')
    console.log(
      '%c AI Agent Summary ',
      'background: #6f42c1; color: white; padding: 2px 6px; border-radius: 3px;'
    )
    console.log('')
    console.log('Waterfall chain with source locations:')
    console.log('')
    chains.forEach((chain, chainIndex) => {
      chain.forEach((fetchEvent, j) => {
        const arrow = j < chain.length - 1 ? ' →' : ''
        const userFrames = filterStackFrames(fetchEvent.parsedFrames)
        const location =
          userFrames.length > 0
            ? `${userFrames[0].fileName}:${userFrames[0].lineNumber}:${userFrames[0].columnNumber}`
            : 'unknown location'
        const funcName =
          userFrames.length > 0 && userFrames[0].functionName !== '<anonymous>'
            ? ` (${userFrames[0].functionName})`
            : ''
        console.log(`  ${j + 1}. fetch("${fetchEvent.url}")${arrow}`)
        console.log(`     └─ ${location}${funcName}`)
      })
      if (chainIndex < chains.length - 1) console.log('')
    })
    console.log('')
    console.log('The fetch calls above happen sequentially because each one')
    console.log('triggers a React re-render that starts the next fetch.')

    // Recommendation
    console.log('')
    console.log(
      '%c Recommendation ',
      'background: #228be6; color: white; padding: 2px 6px; border-radius: 3px;'
    )
    console.log(
      '  To eliminate these waterfalls, consider fetching data at a higher level'
    )
    console.log('  in the component tree, or use Promise.all() to parallelize.')
    console.log('')

    // Send report to server
    sendReportToServer({
      type: 'waterfall',
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: Date.now(),
      totalFetches: fetchEvents.length,
      totalCommits: commitEvents.length,
      renderTriggeringFetches: renderTriggeringFetches.map((f) => ({
        url: f.url,
        stackTrace: f.stackTrace,
        parsedFrames: f.parsedFrames,
      })),
      waterfallChains: chains.map((chain) =>
        chain.map((f) => ({
          url: f.url,
          stackTrace: f.stackTrace,
          parsedFrames: f.parsedFrames,
        }))
      ),
    })
  }
}

/**
 * Capture a clean stack trace, excluding our patched fetch
 * Returns both the Error object and parsed frames
 */
function captureStackTrace(): {
  error: Error
  stack: string
  frames: StackFrame[]
} {
  const error = new Error('Fetch call site')
  if (Error.captureStackTrace) {
    // V8 engines: exclude patchedFetch from stack
    Error.captureStackTrace(error, globalThis.fetch)
  }
  const stack = error.stack || ''
  const frames = parseStackFrames(stack)
  return { error, stack, frames }
}

/**
 * Parse stack trace string into structured frames
 */
function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = []
  const lines = stack.split('\n')

  for (const line of lines) {
    // Match V8 stack frame format: "    at FunctionName (file:line:col)" or "    at file:line:col"
    const match = line.match(/^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/)
    if (match) {
      frames.push({
        functionName: match[1] || '<anonymous>',
        fileName: match[2],
        lineNumber: parseInt(match[3], 10),
        columnNumber: parseInt(match[4], 10),
        raw: line.trim(),
      })
    }
  }

  return frames
}

/**
 * Resolve stack frames - currently returns frames as-is
 * Source map resolution happens server-side after the report is sent
 */
async function resolveStackFrames(frames: StackFrame[]): Promise<StackFrame[]> {
  // Stack frames are sent raw to the server, which resolves them using source maps
  return frames
}

/**
 * Report structure sent to the server for processing
 */
interface WaterfallReport {
  type: 'waterfall' | 'render-blocking' | 'no-waterfall' | 'no-fetches'
  pageUrl: string
  timestamp: number
  totalFetches: number
  totalCommits: number
  renderTriggeringFetches: Array<{
    url: string
    stackTrace: string
    parsedFrames: StackFrame[]
  }>
  waterfallChains: Array<
    Array<{
      url: string
      stackTrace: string
      parsedFrames: StackFrame[]
    }>
  >
}

/**
 * Send the waterfall report to the server for source map resolution and logging
 */
async function sendReportToServer(report: WaterfallReport): Promise<void> {
  try {
    const response = await originalFetch('/__nextjs_profiler_ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    })

    if (!response.ok) {
      console.warn(
        '[Waterfall Detector] Failed to send report to server:',
        response.status
      )
    }
  } catch (error) {
    // Silently fail - don't disrupt the user experience
    console.warn('[Waterfall Detector] Could not send report to server:', error)
  }
}

/**
 * Filter stack frames to show only user code
 */
function filterStackFrames(frames: StackFrame[]): StackFrame[] {
  const excludePatterns = [
    'node_modules',
    'patchedFetch',
    'waterfall-detector',
    'webpack',
    'turbopack',
    '<anonymous>',
    '_next/static/chunks',
    'react-dom',
    'react.',
    'scheduler',
  ]

  return frames.filter((frame) => {
    const combined = `${frame.fileName} ${frame.functionName}`
    return !excludePatterns.some((pattern) => combined.includes(pattern))
  })
}

/**
 * Truncate URL for display
 */
function truncateUrl(url: string, maxLength: number = 60): string {
  if (url.length <= maxLength) return url
  return url.slice(0, maxLength - 3) + '...'
}

/**
 * Disable waterfall detection (called on client-side navigation)
 */
export function disableWaterfallDetector() {
  if (hasAnalyzed) return

  // Mark as analyzed to stop all tracking
  hasAnalyzed = true
  isInitialLoad = false

  // Clean up timers
  if (settleTimer) clearTimeout(settleTimer)
  if (idleTimer) clearTimeout(idleTimer)
  if (maxWindowTimer) clearTimeout(maxWindowTimer)

  log('Disabled (client-side navigation detected)')
}

/**
 * Initialize waterfall detection
 */
export function initWaterfallDetector() {
  // Guard against double initialization (can happen if both app-bootstrap and pages index run)
  if (isInitialized) return
  isInitialized = true

  log('Initializing waterfall detection for initial page load')
  log(
    `Artificial delays: ${BASE_DELAY}ms base + ${DELAY_INCREMENT}ms per fetch`
  )
  log('Fetches will be slower than normal to detect causal relationships')
  console.log('')

  // Patch fetch before any code runs
  patchFetch()

  // Setup React DevTools hook
  setupReactHook()

  // Start idle timer
  resetIdleTimer()

  // Set maximum analysis window
  maxWindowTimer = setTimeout(() => {
    if (!hasAnalyzed) {
      log('Maximum analysis window reached, analyzing now...')
      analyzeWaterfalls()
    }
  }, MAX_ANALYSIS_WINDOW)

  // Also analyze on page visibility change (user switches tabs)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !hasAnalyzed) {
        analyzeWaterfalls()
      }
    })
  }
}
