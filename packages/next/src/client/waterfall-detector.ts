/**
 * Waterfall Detection for Next.js Insights Builds
 *
 * This module detects fetch waterfalls during initial page load by:
 * 1. Patching globalThis.fetch with artificial delays to amplify timing relationships
 * 2. Hooking into React DevTools to track commits
 * 3. Analyzing the timeline to find: fetch.end → commit → fetch.start chains
 *
 * Only active when process.env.__NEXT_INSIGHTS_BUILD is true
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
const FETCH_DELAY_MIN = 1000 // Minimum artificial delay
const FETCH_DELAY_MAX = 3000 // Maximum artificial delay
const FETCH_DELAY_STEP = 500 // Delay increments (1000, 1500, 2000, 2500, 3000)
const PROXIMITY_THRESHOLD = 100 // ms to consider events causally related
const IDLE_TIMEOUT = 4000 // Consider page idle after 4s of no fetch activity (> max delay)
const MAX_ANALYSIS_WINDOW = 60000 // Stop analyzing after 60s regardless

/**
 * Get a random delay between FETCH_DELAY_MIN and FETCH_DELAY_MAX in FETCH_DELAY_STEP increments
 */
function getRandomDelay(): number {
  const steps = (FETCH_DELAY_MAX - FETCH_DELAY_MIN) / FETCH_DELAY_STEP + 1 // 5 steps: 1000, 1500, 2000, 2500, 3000
  const randomStep = Math.floor(Math.random() * steps)
  return FETCH_DELAY_MIN + randomStep * FETCH_DELAY_STEP
}

// State
let fetchCounter = 0
let pendingFetches = 0 // Track in-flight fetches
const fetchEvents: FetchEvent[] = []
const commitEvents: CommitEvent[] = []
let idleTimer: ReturnType<typeof setTimeout> | null = null
let maxWindowTimer: ReturnType<typeof setTimeout> | null = null
let hasAnalyzed = false
let isInitialLoad = true
let isInitialized = false
const originalFetch = globalThis.fetch

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

    // Capture stack trace synchronously BEFORE any await
    const {
      error,
      stack: stackTrace,
      frames: parsedFrames,
    } = captureStackTrace()
    const startTime = performance.now()
    const delay = getRandomDelay()

    // Track pending fetch
    pendingFetches++

    try {
      // Actually perform the fetch
      const result = await originalFetch.call(globalThis, input, init)

      // Apply artificial delay AFTER response arrives
      // This amplifies the timing relationship between fetches
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
    } else {
      // React DevTools hook might not be available yet, retry
      setTimeout(checkHook, 50)
    }
  }

  checkHook()
}

/**
 * Reset the idle timer - triggers analysis when page becomes idle
 * Waits for IDLE_TIMEOUT of no fetch activity before analyzing
 */
function resetIdleTimer() {
  if (hasAnalyzed) return

  // Clear existing timer
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }

  // Don't start timer if fetches are still in-flight
  if (pendingFetches > 0) {
    return
  }

  // Wait for idle period with no new fetches
  idleTimer = setTimeout(() => {
    if (pendingFetches === 0 && !hasAnalyzed) {
      analyzeWaterfalls()
    }
  }, IDLE_TIMEOUT)
}

/**
 * Analyze the collected fetch and commit events to detect waterfall patterns
 */
async function analyzeWaterfalls() {
  if (hasAnalyzed) return
  hasAnalyzed = true
  isInitialLoad = false

  // Clean up timers and UI
  if (idleTimer) clearTimeout(idleTimer)
  if (maxWindowTimer) clearTimeout(maxWindowTimer)
  hideWarningBanner()

  if (fetchEvents.length === 0) {
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

  // Determine report type and send to server
  if (chains.length === 0 && renderTriggeringFetches.length === 0) {
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
    await originalFetch('/__nextjs_insights_ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
    })
  } catch {
    // Silently fail - don't disrupt the user experience
  }
}

let warningBanner: HTMLDivElement | null = null

/**
 * Show minimal warning banner during detection
 */
function showWarningBanner() {
  if (typeof document === 'undefined') return

  warningBanner = document.createElement('div')
  warningBanner.id = '__next_insights_banner'
  warningBanner.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: #18181b;
    color: #fafafa;
    padding: 8px 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    border-radius: 6px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `
  warningBanner.textContent = 'Detecting waterfalls...'
  document.body.appendChild(warningBanner)
}

/**
 * Hide warning banner after detection
 */
function hideWarningBanner() {
  if (warningBanner && warningBanner.parentNode) {
    warningBanner.parentNode.removeChild(warningBanner)
    warningBanner = null
  }
}

/**
 * Disable waterfall detection (called on client-side navigation)
 */
export function disableWaterfallDetector() {
  if (hasAnalyzed) return

  // Mark as analyzed to stop all tracking
  hasAnalyzed = true
  isInitialLoad = false

  // Clean up timers and UI
  if (idleTimer) clearTimeout(idleTimer)
  if (maxWindowTimer) clearTimeout(maxWindowTimer)
  hideWarningBanner()
}

/**
 * Initialize waterfall detection
 */
export function initWaterfallDetector() {
  // Guard against double initialization (can happen if both app-bootstrap and pages index run)
  if (isInitialized) return
  isInitialized = true

  // Patch fetch before any code runs
  patchFetch()

  // Setup React DevTools hook
  setupReactHook()

  // Show warning banner when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showWarningBanner)
    } else {
      showWarningBanner()
    }
  }

  // Start idle timer
  resetIdleTimer()

  // Set maximum analysis window
  maxWindowTimer = setTimeout(() => {
    if (!hasAnalyzed) {
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
