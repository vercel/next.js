/**
 * Waterfall Detection Client for Next.js Insights Builds
 *
 * This module collects raw timing data during initial page load:
 * 1. Patches globalThis.fetch to add artificial delays and capture timing
 * 2. Hooks into React DevTools to track commits
 * 3. Sends raw data to the server for analysis
 *
 * All analysis logic is on the server side.
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
  parsedFrames: StackFrame[]
}

interface CommitEvent {
  time: number
}

// Configuration
const FETCH_DELAY_MIN = 1000 // Minimum artificial delay
const FETCH_DELAY_MAX = 3000 // Maximum artificial delay
const FETCH_DELAY_STEP = 500 // Delay increments (1000, 1500, 2000, 2500, 3000)
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
    const { stack: stackTrace, frames: parsedFrames } = captureStackTrace()
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
 * Reset the idle timer - triggers sending data when page becomes idle
 * Waits for IDLE_TIMEOUT of no fetch activity before sending
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
      sendRawData()
    }
  }, IDLE_TIMEOUT)
}

/**
 * Send raw timing data to the server for analysis
 */
async function sendRawData() {
  if (hasAnalyzed) return
  hasAnalyzed = true
  isInitialLoad = false

  // Clean up timers and UI
  if (idleTimer) clearTimeout(idleTimer)
  if (maxWindowTimer) clearTimeout(maxWindowTimer)
  hideWarningBanner()

  // Sort events by time before sending
  fetchEvents.sort((a, b) => a.startTime - b.startTime)
  commitEvents.sort((a, b) => a.time - b.time)

  // Send raw data to server
  const report: RawWaterfallReport = {
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    timestamp: Date.now(),
    fetchEvents: fetchEvents.map((f) => ({
      id: f.id,
      url: f.url,
      startTime: f.startTime,
      endTime: f.endTime,
      artificialDelay: f.artificialDelay,
      stackTrace: f.stackTrace,
      parsedFrames: f.parsedFrames,
    })),
    commitEvents: commitEvents.map((c) => ({
      time: c.time,
    })),
  }

  try {
    // Route ID is injected at build time to avoid collisions with user routes
    // The route is created at /{routeId} as a real app route
    const routeId = process.env.__NEXT_INSIGHTS_ROUTE
    if (!routeId) {
      console.warn('[Insights] No insights route configured')
      return
    }
    await originalFetch(`/${routeId}`, {
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

/**
 * Capture a clean stack trace, excluding our patched fetch
 */
function captureStackTrace(): {
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
  return { stack, frames }
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
 * Raw report structure sent to the server
 * Server handles all analysis logic
 */
interface RawWaterfallReport {
  pageUrl: string
  timestamp: number
  fetchEvents: Array<{
    id: number
    url: string
    startTime: number
    endTime: number
    artificialDelay: number
    stackTrace: string
    parsedFrames: StackFrame[]
  }>
  commitEvents: Array<{
    time: number
  }>
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
      sendRawData()
    }
  }, MAX_ANALYSIS_WINDOW)

  // Also send data on page visibility change (user switches tabs)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && !hasAnalyzed) {
        sendRawData()
      }
    })
  }
}
