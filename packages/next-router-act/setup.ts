/**
 * Browser-side runtime for @next/router-act.
 *
 * This module installs a fetch monkey-patch that intercepts RSC requests
 * (prefetches, navigations, server actions) and buffers their responses.
 * The Playwright-side orchestrator (index.ts) drives the lifecycle remotely
 * via page.evaluate() calls to window.__ROUTER_ACT.
 *
 * Architecture:
 *
 *   Playwright (index.ts)             Browser (this file)
 *   ─────────────────────             ───────────────────
 *   evaluate: startBatch()        →   Push new batch onto stack
 *   run scope()                       fetch() calls are intercepted
 *   evaluate: drainQueue(config)  →   Wait for idle, match responses,
 *                                     resolve/block, loop until settled
 *                               ←     Return matched indices + any error
 *   evaluate: endBatch()         →   Pop batch, transfer blocked to parent
 *
 * Key concepts:
 *
 * - Batch: A scope of intercepted requests, corresponding to one act() call.
 *   Batches nest via a stack to support nested act() calls.
 *
 * - PendingRequest lifecycle:
 *     in-flight (bodyText===null)
 *       → buffered (bodyText set, originalResponse set)
 *       → processed (resolved to client) or blocked (held for parent batch)
 *
 * - The drain loop runs entirely in the browser to avoid IPC round trips
 *   for each scheduling step (idle callbacks, waiting for in-flight requests).
 *   The Playwright side sends one config object and gets back one result.
 */

type DrainQueueConfig = {
  expectedIncludes: Array<{ includes: string; block: boolean }>
  forbiddenIncludes: string[]
  allowErrorStatusCodes: number[]
  shouldBlockAll: boolean
  noRequests: boolean
  waitForFirstRequestMs: number | null
}

type DrainQueueResult = {
  matchedIndices: number[]
  error?: {
    type:
      | 'unexpected-request'
      | 'error-status'
      | 'forbidden-match'
      | 'duplicate-match'
      | 'timed-out'
    url: string
    bodyText: string
    status: number
    headers: Record<string, string>
    substring?: string
  }
}

declare global {
  interface Window {
    __ROUTER_ACT: {
      startBatch: () => void
      endBatch: () => void
      drainQueue: (config: DrainQueueConfig) => Promise<DrainQueueResult>
    }
  }
}

type PendingRequest = {
  url: string
  /** Response body text. null while the server response is still in-flight. */
  bodyText: string | null
  status: number
  headers: Record<string, string>
  /** Resolves when the server response has been received and buffered. */
  responseReady: Promise<void>
  /** Resolves the promise returned to the browser's fetch caller
   *  (React/router). Called by the drain loop to deliver the response. */
  resolve: ((value: Response) => void) | null
  /** Rejects the promise returned to the browser's fetch caller. */
  reject: ((reason: unknown) => void) | null
  /** The original Response object, kept unconsumed so it can be forwarded
   *  to the client when unblocked. We clone() before reading the body text
   *  so this remains consumable. */
  originalResponse: Response | null
  /** True once this request has been resolved to the client. Terminal state —
   *  the drain loop will skip this request in subsequent iterations. */
  processed: boolean
  /** True if this request is being held back for the parent batch. Set by
   *  the drain loop when a response matches a `block: true` expectation,
   *  or when `shouldBlockAll` is true. */
  blocked: boolean
  /** True once this request has been inspected by the drain loop (matched
   *  against expectations, checked for errors). When a blocked request is
   *  transferred from a child batch to its parent via endBatch(), it keeps
   *  didProcess=true so the parent's drain loop skips re-inspection and
   *  just resolves it. */
  didProcess: boolean
}

type Batch = {
  pending: PendingRequest[]
  /** Callback set by waitForFirstRequest(). Called by the fetch interceptor
   *  when the first RSC request arrives in this batch. */
  firstRequestResolve: (() => void) | null
}

/**
 * Check whether fetch init headers indicate an RSC request (navigation,
 * prefetch, or server action). Handles all three header formats: Headers
 * object, plain object, and array-of-tuples.
 */
function hasRSCHeader(init?: RequestInit): boolean {
  if (!init?.headers) return false
  const headers = init.headers
  if (headers instanceof Headers) {
    return headers.has('RSC') || headers.has('Next-Action')
  }
  if (Array.isArray(headers)) {
    return headers.some(
      ([key]) =>
        key.toLowerCase() === 'rsc' || key.toLowerCase() === 'next-action'
    )
  }
  const keys = Object.keys(headers)
  return keys.some((key) => {
    const lower = key.toLowerCase()
    return lower === 'rsc' || lower === 'next-action'
  })
}

/**
 * Wait for cascading work to settle after delivering responses to the
 * client. Resolving a response can trigger a chain of async work:
 *
 *   response delivered → segment cache processes it →
 *   IntersectionObserver fires for new links → prefetch scheduler
 *   queues tasks → new fetch() calls are initiated
 *
 * IntersectionObserver callbacks fire during the browser's rendering
 * pipeline. A newly observed element won't be reported until a
 * subsequent frame's intersection observation step. We wait for two
 * rendering frames (double-rAF) to ensure the IO has had a full
 * layout + paint cycle to detect and report new elements. Then we wait
 * for the browser to be idle (via requestIdleCallback) so that any
 * work triggered by the IO callbacks — like prefetch scheduling and
 * fetch calls — has completed. Finally, we wait for any in-flight
 * fetch requests to receive their server responses.
 */
async function waitForCascadingWork(batch: Batch): Promise<void> {
  await new Promise<void>((res) =>
    requestAnimationFrame(() => requestAnimationFrame(() => res()))
  )
  await new Promise<void>((res) =>
    requestIdleCallback(() => res(), { timeout: 100 })
  )
  await Promise.all(
    batch.pending
      .filter((r) => !r.processed && !r.blocked && r.bodyText === null)
      .map((r) => r.responseReady)
  )
}

/**
 * Installs the router-act fetch instrumentation on the current window.
 * Returns a cleanup function that restores the original fetch.
 */
export function installRouterActSetup(): () => void {
  const originalFetch = globalThis.fetch
  const batchStack: Batch[] = []

  function currentBatch(): Batch | null {
    return batchStack.length > 0 ? batchStack[batchStack.length - 1] : null
  }

  /**
   * Returns a promise that resolves when the first RSC request arrives in
   * the given batch, or rejects after timeoutMs. If requests have already
   * arrived, resolves immediately.
   */
  function waitForFirstRequest(batch: Batch, timeoutMs: number): Promise<void> {
    if (batch.pending.length > 0) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const timerId = setTimeout(() => {
        batch.firstRequestResolve = null
        reject(new Error('timed-out'))
      }, timeoutMs)

      batch.firstRequestResolve = () => {
        clearTimeout(timerId)
        resolve()
      }
    })
  }

  // Intercept fetch calls that have RSC headers (navigations, prefetches,
  // server actions). Non-RSC fetches and fetches made outside an active
  // batch pass through to the original fetch unchanged.
  //
  // The intercepted fetch is called immediately (we don't delay requests
  // to the server), but the Response is held back from the caller until
  // the drain loop decides to release it. This gives act() control over
  // when React sees the response.
  globalThis.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const batch = currentBatch()
    if (batch === null || !hasRSCHeader(init)) {
      return originalFetch(input, init)
    }

    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url

    // Call original fetch immediately — don't delay requests to server
    const fetchPromise = originalFetch(input, init)

    let resolveResponseReady: () => void
    const responseReady = new Promise<void>((res) => {
      resolveResponseReady = res
    })

    const pendingRequest: PendingRequest = {
      url,
      bodyText: null,
      status: 0,
      headers: {},
      responseReady,
      resolve: null,
      reject: null,
      originalResponse: null,
      processed: false,
      blocked: false,
      didProcess: false,
    }

    // Add to batch immediately, before the response arrives. This lets
    // waitForFirstRequest() detect that a request has been initiated
    // even if the server hasn't responded yet.
    batch.pending.push(pendingRequest)

    if (batch.firstRequestResolve !== null) {
      batch.firstRequestResolve()
      batch.firstRequestResolve = null
    }

    // Return a new promise to the caller (React/router). This promise is
    // resolved later by the drain loop, giving act() control over when
    // the response is delivered.
    return new Promise<Response>((resolveToClient, rejectToClient) => {
      pendingRequest.resolve = resolveToClient
      pendingRequest.reject = rejectToClient

      fetchPromise.then(
        async (response) => {
          // Read the full response body, then construct a fresh Response
          // for the client. We avoid response.clone() because it creates
          // a ReadableStream tee, and in Chromium tee'd stream reads can
          // resolve as macrotasks rather than microtasks. A fresh
          // Response with a non-tee'd body avoids this issue.
          let bodyText: string
          try {
            bodyText = await response.text()
          } catch {
            bodyText = ''
          }

          const responseHeaders: Record<string, string> = {}
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value
          })

          pendingRequest.bodyText = bodyText
          pendingRequest.status = response.status
          pendingRequest.headers = responseHeaders

          // Reconstruct a Response with a fresh (non-tee'd) body while
          // preserving properties like `url` and `redirected` that the
          // segment cache depends on but that the Response constructor
          // doesn't support setting.
          const reconstructed = new Response(bodyText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          })
          Object.defineProperty(reconstructed, 'url', {
            value: response.url,
          })
          Object.defineProperty(reconstructed, 'redirected', {
            value: response.redirected,
          })
          pendingRequest.originalResponse = reconstructed

          resolveResponseReady!()
        },
        (fetchError) => {
          rejectToClient(fetchError)
          resolveResponseReady!()
        }
      )
    })
  }

  window.__ROUTER_ACT = {
    startBatch() {
      batchStack.push({
        pending: [],
        firstRequestResolve: null,
      })
    },

    // Pop the current batch off the stack and clean up all remaining
    // requests. Blocked requests are transferred to the parent batch
    // (or resolved immediately if there's no parent). Unprocessed
    // requests are resolved to the client so their fetch promises don't
    // hang. In-flight requests (server hasn't responded yet) are set up
    // to resolve transparently when the server responds.
    endBatch(): void {
      const batch = batchStack.pop()
      if (!batch) return

      const parentBatch = currentBatch()

      for (const req of batch.pending) {
        if (req.processed) {
          continue
        }

        if (req.blocked) {
          if (parentBatch) {
            req.blocked = false
            parentBatch.pending.push(req)
          } else if (req.resolve && req.originalResponse) {
            req.resolve(req.originalResponse)
          }
          continue
        }

        // Unprocessed, non-blocked. Resolve immediately if the response
        // is available, or set up transparent passthrough for in-flight.
        if (req.originalResponse && req.resolve) {
          req.resolve(req.originalResponse)
        } else if (req.resolve) {
          const originalResolve = req.resolve
          req.resolve = null
          req.responseReady.then(() => {
            if (req.originalResponse) {
              originalResolve(req.originalResponse)
            }
          })
        }
      }
    },

    /**
     * Main entry point called by the Playwright orchestrator after the
     * scope function completes. Runs the entire drain loop in the browser:
     *
     * 1. Optionally wait for the first RSC request to arrive
     * 2. Wait for React to settle (idle callback)
     * 3. Wait for in-flight requests to receive server responses
     * 4. Process all buffered responses: check errors, match against
     *    expected substrings, resolve or block
     * 5. Repeat steps 2-4 until no more pending requests
     * 6. Return matched indices and any error to Playwright
     */
    async drainQueue(config: DrainQueueConfig): Promise<DrainQueueResult> {
      const {
        expectedIncludes,
        forbiddenIncludes,
        allowErrorStatusCodes,
        shouldBlockAll,
        noRequests,
        waitForFirstRequestMs,
      } = config

      const batch = currentBatch()
      if (!batch) return { matchedIndices: [] }

      if (waitForFirstRequestMs !== null) {
        try {
          await waitForFirstRequest(batch, waitForFirstRequestMs)
        } catch {
          return {
            matchedIndices: [],
            error: {
              type: 'timed-out',
              url: '',
              bodyText: '',
              status: 0,
              headers: {},
            },
          }
        }
      }

      // Track which expected includes have been claimed by responses.
      // Each expectation can only be claimed once. If the same substring
      // appears in multiple responses, a separate expectation must be
      // listed for each occurrence.
      const matchedIndices: number[] = []
      const claimedIndices = new Set<number>()

      await waitForCascadingWork(batch)

      while (true) {
        const pending = batch.pending.filter(
          (r) => !r.processed && !r.blocked && r.bodyText !== null
        )

        if (pending.length === 0) {
          // Before exiting, check for in-flight requests (initiated but
          // server hasn't responded yet). These must be waited on because
          // the response stream may trigger cascading work in the segment
          // cache (e.g., processing data later in the stream).
          const inFlight = batch.pending.filter(
            (r) => !r.processed && !r.blocked && r.bodyText === null
          )
          if (inFlight.length > 0) {
            await Promise.all(inFlight.map((r) => r.responseReady))
            continue
          }
          break
        }

        for (const req of pending) {
          // Requests with didProcess=true were already inspected by an
          // inner act's drain loop and then transferred to this batch via
          // endBatch(). Just resolve them without re-inspection.
          if (req.didProcess) {
            if (req.resolve && req.originalResponse) {
              req.processed = true
              req.resolve(req.originalResponse)
            }
            continue
          }

          if (noRequests) {
            // Resolve remaining requests so fetch promises don't hang,
            // then return the error.
            resolveAllPending(batch)
            return {
              matchedIndices,
              error: {
                type: 'unexpected-request',
                url: req.url,
                bodyText: req.bodyText!,
                status: req.status,
                headers: req.headers,
              },
            }
          }

          if (
            req.status >= 400 &&
            !allowErrorStatusCodes.includes(req.status)
          ) {
            resolveAllPending(batch)
            return {
              matchedIndices,
              error: {
                type: 'error-status',
                url: req.url,
                bodyText: req.bodyText!,
                status: req.status,
                headers: req.headers,
              },
            }
          }

          for (const forbidden of forbiddenIncludes) {
            if (req.bodyText!.includes(forbidden)) {
              resolveAllPending(batch)
              return {
                matchedIndices,
                error: {
                  type: 'forbidden-match',
                  url: req.url,
                  bodyText: req.bodyText!,
                  status: req.status,
                  headers: req.headers,
                  substring: forbidden,
                },
              }
            }
          }

          // Match this response body against expected substrings.
          //
          // The algorithm iterates through expectations in order:
          // - Skip already-claimed expectations
          // - For unclaimed ones, check if the substring appears in the
          //   remaining (un-matched) portion of the response body
          // - Track whether any already-claimed expectation also matches,
          //   to detect duplicate responses that need separate expectations
          //
          // `remainingBody` shrinks as matches are found, enforcing that
          // multiple expectations matching the same response body must
          // appear in order within that body.
          let shouldBlock = false
          let responseWasClaimed = false
          let firstAlreadyClaimedSubstring: string | null = null
          let remainingBody = req.bodyText!

          for (let i = 0; i < expectedIncludes.length; i++) {
            const { includes, block } = expectedIncludes[i]
            if (!claimedIndices.has(i)) {
              if (remainingBody.includes(includes)) {
                responseWasClaimed = true
                remainingBody = remainingBody.slice(
                  remainingBody.indexOf(includes) + includes.length
                )
                claimedIndices.add(i)
                matchedIndices.push(i)
                if (block) {
                  shouldBlock = true
                }
                continue
              }
            }

            if (
              firstAlreadyClaimedSubstring === null &&
              remainingBody.includes(includes)
            ) {
              firstAlreadyClaimedSubstring = includes
            }
          }

          if (!responseWasClaimed && firstAlreadyClaimedSubstring !== null) {
            resolveAllPending(batch)
            return {
              matchedIndices,
              error: {
                type: 'duplicate-match',
                url: req.url,
                bodyText: req.bodyText!,
                status: req.status,
                headers: req.headers,
                substring: firstAlreadyClaimedSubstring,
              },
            }
          }

          if (shouldBlock || shouldBlockAll) {
            req.blocked = true
            req.didProcess = true
          } else if (req.resolve && req.originalResponse) {
            req.processed = true
            req.resolve(req.originalResponse)
          }
        }

        // After processing all currently-pending responses, wait for
        // cascading work to settle. Delivering responses may trigger new
        // IntersectionObserver callbacks, prefetch scheduling, and fetch
        // calls that span rendering frame boundaries.
        await waitForCascadingWork(batch)
      }

      return { matchedIndices }
    },
  }

  /**
   * Resolve all pending (non-processed, non-blocked) requests in a batch.
   * Called when drainQueue exits early due to an error, to prevent the
   * caller's fetch promises from hanging forever.
   */
  function resolveAllPending(batch: Batch): void {
    for (const req of batch.pending) {
      if (
        !req.processed &&
        !req.blocked &&
        req.resolve &&
        req.originalResponse
      ) {
        req.processed = true
        req.resolve(req.originalResponse)
      }
    }
  }

  return () => {
    globalThis.fetch = originalFetch
    delete (window as any).__ROUTER_ACT
  }
}
