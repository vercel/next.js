import type * as Playwright from 'playwright'
import { diff } from 'jest-diff'
import { equals } from '@jest/expect-utils'

// Mirrors NEXT_ROUTER_PREFETCH_HEADER from the Next.js client. App Shell
// prefetches carry the value '3' (FetchStrategy.RuntimeShell). The App Shell is
// the param/searchParam-independent chrome of a route — conceptually part of the
// route itself, not prefetch data in the way we normally think of it. By default
// we therefore exclude App Shell requests from `act` assertion logic
// (`includes` matching, `no-requests`, and `block: 'reject'`). They are still
// intercepted, fulfilled, and awaited so that the browser caches the shell and
// no requests are left in flight — and they do satisfy the "at least one
// request" check, since they prove the router reacted to the scope. Pass
// `includeAppShellRequests: true` to `createRouterAct` to assert on them
// directly (e.g. when testing App Shell behavior specifically).
const NEXT_ROUTER_PREFETCH_HEADER = 'next-router-prefetch'
const APP_SHELL_PREFETCH_VALUE = '3'

// These headers/values classify each intercepted router request by the kind
// of prefetch protocol it uses, so that expectations can assert on it via
// the `kind` option:
//
// - 'static': per-segment static prefetches. These carry the
//   `next-router-segment-prefetch` header (NEXT_ROUTER_SEGMENT_PREFETCH_HEADER
//   in the client), which is sent both by the per-segment data fetch
//   (`fetchSegmentsOnCacheMissImpl`) and the route tree fetch
//   (`fetchRouteOnCacheMiss`).
// - 'runtime': dynamic prefetch requests, issued by
//   `fetchSegmentPrefetchesUsingDynamicRequest` in the client. These carry a
//   FlightRouterState request tree and a `next-router-prefetch` header value
//   of '2' (FetchStrategy.PPRRuntime) or '3' (FetchStrategy.RuntimeShell).
//   The other strategies used by that path — LoadingBoundary ('1') and Full
//   (no prefetch header) — send the same headers as plain prefetches and
//   navigations respectively, so they cannot be demonstrably classified and
//   are left unclassified.
// - undefined: everything else — navigations, Server Actions, and plain
//   prefetches. Expectations that specify a `kind` never claim these.
const NEXT_ROUTER_SEGMENT_PREFETCH_HEADER = 'next-router-segment-prefetch'
const PPR_RUNTIME_PREFETCH_VALUE = '2'

type ResponseKind = 'static' | 'runtime'

type Batch = {
  pendingRequestChecks: Set<Promise<void>>
  pendingRequests: Set<PendingRSCRequest>
  // Whether any router request — including an App Shell request — was
  // received by this batch. Used by the "at least one request" watchdog:
  // any router request proves the router reacted to the `act` scope, even
  // ones that are excluded from the assertion logic. Also set when an inner
  // `act`'s blocked responses are transferred to this batch.
  didReceiveRouterRequest: boolean
}

type PendingRSCRequest = {
  url: string
  route: Playwright.Route | null
  result: Promise<{
    text: string
    body: any
    headers: Record<string, string>
    status: number
  }>
  didProcess: boolean
  // True if this is an App Shell prefetch request that should be ignored for
  // assertion purposes (see note above). Always false when the caller passes
  // `includeAppShellRequests: true`.
  isAppShell: boolean
  // The kind of prefetch protocol this request uses, derived from its headers
  // (see the classification note above). undefined for navigations, Server
  // Actions, and plain prefetches.
  kind: ResponseKind | undefined
}

let currentBatch: Batch | null = null

type ExpectedResponseConfig = {
  includes: string
  block?: boolean | 'reject'
  kind?: ResponseKind
}

/**
 * Represents the expected responses sent by the server to fulfill requests
 * initiated by the `scope` function.
 *
 * - `includes` is a substring of an expected response body.
 * - `block` indicates whether the response should not yet be sent to the
 *   client. This option is only supported when nested inside an outer `act`
 *   scope. The blocked response will be fulfilled when the outer
 *   scope completes.
 * - `kind` restricts which responses can satisfy the expectation, based on
 *   the kind of prefetch request that produced them: 'static' matches only
 *   per-segment static prefetches (those with a `next-router-segment-prefetch`
 *   request header), and 'runtime' matches only dynamic prefetch requests
 *   (those with a `next-router-prefetch` header value of '2' (PPRRuntime) or
 *   '3' (RuntimeShell)). If omitted, any router response can satisfy the
 *   expectation. Note that App Shell (RuntimeShell) responses are excluded
 *   from assertion logic by default, so a `kind: 'runtime'` expectation that
 *   should match an App Shell response additionally requires passing
 *   `includeAppShellRequests: true` to `createRouterAct`.
 *
 * The list of expected responses does not need to be exhaustive — any
 * responses that don't match will proceed like normal. However, `act` will
 * error if the expected substring is not found in any of the responses, or
 * if the expected responses are received out of order. It will also error
 * if the same expected substring is found in multiple responses.
 *
 * If no expected responses are provided, the only expectation is that at
 * least one request is initiated. (This is the same as passing an
 * empty array.)
 *
 * Alternatively, if no network activity is expected, pass "no-requests".
 */
type ActConfig =
  | ExpectedResponseConfig
  | Array<ExpectedResponseConfig>
  | 'block'
  | 'no-requests'
  | null

export function createRouterAct(
  page: Playwright.Page,
  options?: {
    /**
     * Status codes that are allowed to be returned by the server. If not
     * provided, all error status codes are disallowed (400+).
     */
    allowErrorStatusCodes?: number[]
    /**
     * By default, App Shell prefetch requests (those with a
     * `next-router-prefetch: '3'` header) are ignored for the purposes of
     * assertion matching, `no-requests`, `block: 'reject'`, and the "at least
     * one request" check. They are still intercepted, fulfilled, and awaited.
     *
     * Set this to `true` to treat App Shell requests like any other router
     * request. Use this when writing tests for App Shell behavior specifically.
     */
    includeAppShellRequests?: boolean
  }
): <T>(scope: () => Promise<T> | T, config?: ActConfig) => Promise<T> {
  const includeAppShellRequests = options?.includeAppShellRequests ?? false

  // Track App Shell requests that are currently in flight anywhere on the
  // page — including ones initiated outside an `act` scope, like viewport
  // prefetches during the initial page load. The "at least one request"
  // watchdog consults this set: the prefetch scheduler's Shell phase does not
  // complete until its shell responses have arrived, so while a shell request
  // is in flight, follow-up requests (which ARE countable) may be
  // legitimately waiting on it. In that case the watchdog keeps waiting
  // instead of timing out. See the watchdog logic inside `act`.
  const inFlightAppShellRequests = new Set<Playwright.Request>()
  const onRequestStarted = (request: Playwright.Request) => {
    if (
      request.headers()[NEXT_ROUTER_PREFETCH_HEADER] ===
      APP_SHELL_PREFETCH_VALUE
    ) {
      inFlightAppShellRequests.add(request)
    }
  }
  const onRequestSettled = (request: Playwright.Request) => {
    inFlightAppShellRequests.delete(request)
  }
  // A hard navigation can orphan in-flight requests: Playwright doesn't
  // reliably emit `requestfinished`/`requestfailed` for requests aborted by
  // page teardown, which would leave stale entries in the set for the rest
  // of the test — and a stale entry keeps the watchdog alive forever,
  // turning what should be a clean timeout error into a hang. The destroyed
  // document's shell requests can't gate anything anymore, and the new
  // document's requests re-add themselves, so drop them all.
  const onFrameDetached = () => {
    inFlightAppShellRequests.clear()
  }
  page.on('request', onRequestStarted)
  page.on('requestfinished', onRequestSettled)
  page.on('requestfailed', onRequestSettled)
  page.on('framedetached', onFrameDetached)
  /**
   * Helper function to wait for requestIdleCallback with retry logic.
   * Retries up to 3 times if "Execution context was destroyed" error occurs.
   */
  async function waitForIdleCallback(): Promise<void> {
    const maxRetries = 3
    const retryDelayMs = 100

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await page.evaluate(
          () =>
            new Promise<void>((res) =>
              requestIdleCallback(() => res(), {
                // Add a timeout option to prevents the callback from being
                // backgrounded indefinitely. Not sure why this happens but
                // without it, the callback will never fire.
                //
                // Note that this does not delay the callback from firing.
                // It should still fire pretty much "immediately". It's just a
                // safeguard in case the idle callback queue is not fired within
                // a reasonable amount of time. It really shouldn't
                // be necessary.
                //
                // TODO: I'm getting increasingly frustrated by how flaky
                // Playwright's APIs are. At this point I'm convinced we should
                // rewrite the whole router-act module to an equivalent
                // implementation that runs directly in the browser, by
                // injecting a script into the page. Since we only use it for
                // our own contrived e2e test apps, we can just import the
                // script into each test app that needs it.
                timeout: 100,
              })
            )
        )
        return
      } catch (err) {
        const isLastAttempt = attempt === maxRetries - 1
        const isExecutionContextError =
          err instanceof Error &&
          err.message.includes('Execution context was destroyed')

        if (isExecutionContextError && !isLastAttempt) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          continue
        }

        throw err
      }
    }
  }

  /**
   * Test utility for requests initiated by the Next.js Router, such as
   * prefetches and navigations. Calls the given async function then intercepts
   * any router requests that are initiated as a result. It will then wait for
   * all the requests to complete before exiting. Inspired by the React
   * `act` API.
   */
  async function act<T>(
    scope: () => Promise<T> | T,
    config?: ActConfig
  ): Promise<T> {
    // Capture a stack trace for better async error messages.
    const error = new Error()
    if (Error.captureStackTrace) {
      Error.captureStackTrace(error, act)
    }

    let expectedResponses: Array<ExpectedResponseConfig> | null
    let forbiddenResponses: Array<ExpectedResponseConfig> | null = null
    let shouldBlockAll = false
    const allowStatuses = options?.allowErrorStatusCodes ?? null

    if (config === undefined || config === null) {
      // Default. Expect at least one request, but don't assert on the response.
      expectedResponses = []
    } else if (config === 'block') {
      // Expect at least one request, and block them all from being fulfilled.
      if (currentBatch === null) {
        error.message =
          '`block` option only supported when nested inside an outer ' +
          '`act` scope.'
        throw error
      }
      expectedResponses = []
      shouldBlockAll = true
    } else if (config === 'no-requests') {
      // Expect no requests to be initiated.
      expectedResponses = null
    } else if (!Array.isArray(config)) {
      // Shortcut for a single expected response.
      if (config.block === true && currentBatch === null) {
        error.message =
          '`block: true` option only supported when nested inside an outer ' +
          '`act` scope.'
        throw error
      }
      if (config.block !== 'reject') {
        expectedResponses = [config]
      } else {
        expectedResponses = []
        forbiddenResponses = [config]
      }
    } else {
      expectedResponses = []
      for (const item of config) {
        if (item.block === true && currentBatch === null) {
          error.message =
            '`block: true` option only supported when nested inside an outer ' +
            '`act` scope.'
          throw error
        }
        if (item.block !== 'reject') {
          expectedResponses.push(item)
        } else {
          if (forbiddenResponses === null) {
            forbiddenResponses = [item]
          } else {
            forbiddenResponses.push(item)
          }
        }
      }
    }

    // Attach a route handler to intercept router requests for the duration
    // of the `act` scope. It will be removed before `act` exits.
    let onDidIssueFirstRequest: (() => void) | null = null
    const routeHandler = async (route: Playwright.Route) => {
      const request = route.request()

      const pendingRequests = batch.pendingRequests
      const pendingRequestChecks = batch.pendingRequestChecks

      // Because determining whether we need to intercept the request is an
      // async operation, we collect these promises so we can await them at the
      // end of the `act` scope to see whether any additional requests
      // were initiated.
      // NOTE: The default check doesn't actually need to be async, but since
      // this logic is subtle, to preserve the ability to add an async
      // check later, I'm treating it as if it could possibly be async.
      const checkIfRouterRequest = (async () => {
        const headers = request.headers()

        // The default check includes navigations, prefetches, and actions.
        const isRouterRequest =
          headers['rsc'] !== undefined || // Matches navigations and prefetches
          headers['next-action'] !== undefined // Matches Server Actions

        // App Shell prefetch requests are intercepted and fulfilled like any
        // other router request, but (unless the caller opts in) they don't
        // participate in any assertion logic. See the note at the top of
        // this file.
        const isAppShell =
          !includeAppShellRequests &&
          headers[NEXT_ROUTER_PREFETCH_HEADER] === APP_SHELL_PREFETCH_VALUE

        // Classify the request by the kind of prefetch protocol it uses, so
        // expectations can assert on it via the `kind` option. See the
        // classification note at the top of this file.
        let kind: ResponseKind | undefined
        if (headers[NEXT_ROUTER_SEGMENT_PREFETCH_HEADER] !== undefined) {
          kind = 'static'
        } else if (
          headers[NEXT_ROUTER_PREFETCH_HEADER] === PPR_RUNTIME_PREFETCH_VALUE ||
          headers[NEXT_ROUTER_PREFETCH_HEADER] === APP_SHELL_PREFETCH_VALUE
        ) {
          kind = 'runtime'
        }

        if (isRouterRequest) {
          // This request was initiated by the Next.js Router. Intercept it and
          // add it to the current batch.
          pendingRequests.add({
            url: request.url(),
            route,
            isAppShell,
            kind,
            // `act` controls the timing of when responses reach the client,
            // but it should not affect the timing of when requests reach the
            // server; we pass the request to the server the immediately.
            result: (async () => {
              let originalResponse: Playwright.APIResponse
              try {
                originalResponse = await page.request.fetch(request, {
                  maxRedirects: 0,
                })
              } catch (fetchError) {
                error.message =
                  fetchError instanceof Error
                    ? fetchError.message
                    : String(fetchError)
                throw error
              }

              // WORKAROUND:
              // intercepting responses with 'Transfer-Encoding: chunked' (used for streaming)
              // seems to be problematic sometimes, making the browser error with `net::ERR_INCOMPLETE_CHUNKED_ENCODING`.
              // In particular, this seems to happen when blocking a streaming navigation response. (but not always)
              // Playwright buffers the whole body anyway, so we can remove the header to sidestep this.
              const headers = originalResponse.headers()
              delete headers['transfer-encoding']

              return {
                text: await originalResponse.text(),
                body: await originalResponse.body(),
                headers,
                status: originalResponse.status(),
              }
            })(),
            didProcess: false,
          })
          // Any router request — including an App Shell request, which is
          // otherwise excluded from assertion logic — satisfies the "at least
          // one request" watchdog, since it proves the router reacted to the
          // `act` scope.
          batch.didReceiveRouterRequest = true
          if (onDidIssueFirstRequest !== null) {
            onDidIssueFirstRequest()
            onDidIssueFirstRequest = null
          }
          return
        }
        // This is some other request not related to the Next.js Router. Allow
        // it to continue as normal.
        route.continue()
      })()

      pendingRequestChecks.add(checkIfRouterRequest)
      await checkIfRouterRequest
      // Once we've read the header, we can remove it from the pending set.
      pendingRequestChecks.delete(checkIfRouterRequest)
    }

    let didHardNavigate = false
    const hardNavigationHandler = async () => {
      // If a hard navigation occurs, the current batch of requests is no longer
      // valid. In fact, Playwright will hang indefinitely if we attempt to
      // await the response of an orphaned request. Reset the batch and unblock
      // all the orphaned requests.
      const orphanedRequests = batch.pendingRequests
      batch.pendingRequests = new Set()
      batch.pendingRequestChecks = new Set()
      batch.didReceiveRouterRequest = false
      await Promise.all(
        Array.from(orphanedRequests).map((item) => item.route?.continue())
      )
      didHardNavigate = true
    }

    const waitForPendingRequestChecks = async () => {
      const prevChecks = batch.pendingRequestChecks
      batch.pendingRequestChecks = new Set()
      await Promise.all(prevChecks)
    }

    const prevBatch = currentBatch

    const batch: Batch = {
      pendingRequestChecks: new Set(),
      pendingRequests: new Set(),
      didReceiveRouterRequest: false,
    }
    currentBatch = batch
    await page.route('**/*', routeHandler)
    page.on('framedetached', hardNavigationHandler)
    try {
      // Call the user-provided scope function
      const returnValue = await scope()

      // Wait until the first request is initiated, up to some timeout.
      if (expectedResponses !== null && !batch.didReceiveRouterRequest) {
        await new Promise<void>((resolve, reject) => {
          let timerId: ReturnType<typeof setTimeout>
          const onExpiry = () => {
            // Before timing out, check for App Shell requests in flight
            // elsewhere on the page (e.g. spawned by a viewport prefetch
            // during page load, before this `act` scope began, so it was
            // never intercepted here). The prefetch scheduler's Shell phase
            // doesn't complete until its shell responses arrive, so the
            // first observable request may be legitimately gated on one.
            // Keep the watchdog alive until it settles.
            if (inFlightAppShellRequests.size > 0) {
              timerId = setTimeout(onExpiry, 500)
              return
            }
            error.message = 'Timed out waiting for a request to be initiated.'
            reject(error)
          }
          timerId = setTimeout(onExpiry, 500)
          onDidIssueFirstRequest = () => {
            clearTimeout(timerId)
            resolve()
          }
        })
      }

      // Fulfill all the requests that were initiated by the scope function. But
      // first, wait an additional browser task. This simulates the real world
      // behavior where the network response is received in an async event/task
      // that comes after the scope function, rather than immediately when the
      // scope function exits.
      //
      // We use requestIdleCallback to schedule the task because that's
      // guaranteed to fire after any IntersectionObserver events, which the
      // router uses to track the visibility of links.
      await waitForIdleCallback()

      // Checking whether a request needs to be intercepted is an async
      // operation, so we need to wait for all the checks to complete before
      // checking whether the queue is empty.
      await waitForPendingRequestChecks()

      // Because responding to one request may unblock additional requests,
      // keep checking for more requests until the queue has settled.
      const remaining = new Set<PendingRSCRequest>()
      let actualResponses: Array<ExpectedResponseConfig> = []

      let claimedExpectations = new Set<ExpectedResponseConfig>()

      // Expectations that specify a `kind` and whose expected substring did
      // appear in a response — but a response of the wrong kind, so it could
      // not be claimed. Maps the expectation to the kind of the response the
      // substring appeared in (undefined for responses with no prefetch kind,
      // like navigations). Used to produce a more helpful error message when
      // such an expectation ends up unclaimed.
      const wrongKindMatches = new Map<
        ExpectedResponseConfig,
        ResponseKind | undefined
      >()

      while (batch.pendingRequests.size > 0) {
        const pending = batch.pendingRequests
        batch.pendingRequests = new Set()
        for (const item of pending) {
          const route = item.route
          const url = item.url

          let shouldBlock = false
          const fulfilled = await item.result
          if (item.didProcess) {
            // This response was already processed by an inner `act` call.
          } else {
            item.didProcess = true
            if (!item.isAppShell && expectedResponses === null) {
              error.message = `
Expected no network requests to be initiated.

URL: ${url}
Headers: ${JSON.stringify(fulfilled.headers)}

Response:
${fulfilled.body}
`

              throw error
            }
            // The error-status check applies to all requests, including App
            // Shell requests — a 4xx/5xx App Shell is a real failure.
            if (
              fulfilled.status >= 400 &&
              (allowStatuses === null ||
                !allowStatuses.includes(fulfilled.status))
            ) {
              error.message = `
Received a response with an error status code.

Status: ${fulfilled.status}
URL: ${url}
Headers: ${JSON.stringify(fulfilled.headers)}

Response:
${fulfilled.body}
`
              throw error
            }
            if (!item.isAppShell && forbiddenResponses !== null) {
              for (const forbiddenResponse of forbiddenResponses) {
                // Like expectations, a rejection with `kind` only applies to
                // responses of that kind: the same content may legitimately
                // arrive in a response of a different kind (e.g. a test that
                // asserts shell content arrives statically rejects it at
                // kind: 'runtime' while claiming it at kind: 'static').
                if (
                  forbiddenResponse.kind !== undefined &&
                  forbiddenResponse.kind !== item.kind
                ) {
                  continue
                }
                const includes = forbiddenResponse.includes
                if (fulfilled.body.includes(includes)) {
                  error.message = `
Received a response containing an unexpected substring:

Rejected substring: ${includes}${
                    forbiddenResponse.kind !== undefined
                      ? `\nRejected kind: '${forbiddenResponse.kind}'`
                      : ''
                  }

Response:
${fulfilled.body}
`
                  throw error
                }
              }
            }
            if (!item.isAppShell && expectedResponses !== null) {
              // Check if this response matches any of the expectations.
              //
              //
              // The same response may match multiple expectations, but within
              // that response the expected strings must appear in order. So
              // once something matches, keep track of the remaining
              // response body.
              const entireResponseBody = fulfilled.body
              let remainingUnclaimedBody = entireResponseBody

              // If the response doesn't match any of the expectations, that's
              // fine. If it does match an expectation, but the only thing
              // it matches is an expectation that was already claimed, then
              // that's an error — each occurence of an expectation must be
              // given separately.
              let responseWasClaimed = false
              let firstAlreadyClaimedMatch: ExpectedResponseConfig | null = null
              for (const expectedResponse of expectedResponses) {
                const includes = expectedResponse.includes
                const block = expectedResponse.block
                if (!claimedExpectations.has(expectedResponse)) {
                  if (
                    expectedResponse.kind !== undefined &&
                    expectedResponse.kind !== item.kind
                  ) {
                    // This expectation can only be claimed by a response of a
                    // specific kind, and this response is a different kind. If
                    // the expected substring nevertheless appears in this
                    // response, remember that so we can include it in the
                    // error message if the expectation ends up unclaimed.
                    if (
                      !wrongKindMatches.has(expectedResponse) &&
                      entireResponseBody.includes(includes)
                    ) {
                      wrongKindMatches.set(expectedResponse, item.kind)
                    }
                    // Skip the duplicate-match check below — a wrong-kind
                    // response is not a duplicate occurrence.
                    continue
                  }
                  // This expectation was not already claimed. Check if we
                  // can claim it.
                  if (remainingUnclaimedBody.includes(includes)) {
                    // Match.
                    responseWasClaimed = true
                    // Remove everything up to and including the first
                    // occurrence of the matched substring.
                    remainingUnclaimedBody = remainingUnclaimedBody.slice(
                      remainingUnclaimedBody.indexOf(includes) + includes.length
                    )
                    claimedExpectations.add(expectedResponse)
                    actualResponses.push(expectedResponse)
                    if (block) {
                      shouldBlock = true
                    }
                    continue
                  }
                }

                // This expectation was already claimed, but let's check if the
                // same string occurs later, too. If it does, it implies that
                // the server sent the same string multiple times. This is fine
                // as long as there's a separate expectation for
                // each occurrence.
                //
                // Like the unclaimed path above, a kind-scoped expectation
                // only applies to responses of that kind: its substring
                // appearing in a response of a different kind is not a
                // duplicate occurrence. (E.g. shell content claimed at
                // kind: 'static' may legitimately appear again in the
                // runtime fallback response.)
                if (
                  expectedResponse.kind !== undefined &&
                  expectedResponse.kind !== item.kind
                ) {
                  continue
                }
                if (
                  firstAlreadyClaimedMatch === null &&
                  remainingUnclaimedBody.includes(includes)
                ) {
                  firstAlreadyClaimedMatch = expectedResponse
                }
              }

              if (!responseWasClaimed && firstAlreadyClaimedMatch !== null) {
                // This response did not match any of the _unclaimed_
                // expecations, but it did match something that had already
                // been claimed by an earlier response. This is an error —
                // if the same expectation matches multiple times, you must
                // list out a separate expectation for each occurrence.
                error.message = `
The same expected substring was sent multiple times by the server:

${firstAlreadyClaimedMatch.includes}

Choose a more specific substring to assert on.
`
                throw error
              }
            }
          }

          if (shouldBlock || shouldBlockAll) {
            // This response was blocked by the `block` option. Don't
            // fulfill it yet.
            remaining.add(item)
            if (route === null) {
              error.message = `
The "block" option is not supported for requests that are redirected.

URL: ${url}
Headers: ${JSON.stringify(fulfilled.headers)}

Response:
${fulfilled.body}
`

              throw error
            }
          } else {
            if (route !== null) {
              const request = route.request()
              await route.fulfill({
                body: fulfilled.body,
                headers: fulfilled.headers,
                status: fulfilled.status,
              })
              const browserResponse = await request.response()
              if (browserResponse !== null) {
                // For error responses (>= 400), the browser may not consume the body
                // in the same way, so we skip waiting for finished() to avoid hanging
                if (fulfilled.status < 400) {
                  await browserResponse.finished()
                }
              }
            }
          }

          if (fulfilled.status === 307 || fulfilled.status === 308) {
            // When fulfilling a redirect, for some reason, the page.route()
            // handler installed earlier will not intercept the
            // redirect request. Install a one-off event listener to wait for
            // the redirected request to finish. This works for this case
            // because we don't need to modify to delay the response; we only
            // need to observe when it has finished.
            // TODO: Because this request cannot be intercepted, it's
            // incompatible with the "block" option. I haven't yet figured out
            // a strategy to make that work. In the meantime, attempting to
            // write a test that blocks a redirect will result in an error
            // (see error above).
            await new Promise<void>((resolve, reject) => {
              page.once('request', (req) => {
                const handleResponse = (res: Playwright.Response) => {
                  if (res.url() === req.url()) {
                    batch.pendingRequests.add({
                      url: req.url(),
                      route: null,
                      result: (async () => {
                        return {
                          // For redirects, body may not be available, so catch
                          // the error and return an empty string.
                          text: await res.text().catch(() => ''),
                          body: await res.body().catch(() => Buffer.from('')),
                          headers: res.headers(),
                          status: res.status(),
                        }
                      })(),
                      didProcess: false,
                      // The target of a redirect is a navigation, not an App
                      // Shell prefetch.
                      isAppShell: false,
                      // Navigations have no prefetch kind.
                      kind: undefined,
                    })
                    batch.didReceiveRouterRequest = true
                    page.off('response', handleResponse)
                    page.off('requestfailed', handleFailure)
                    resolve()
                  }
                }
                const handleFailure = (failedReq: Playwright.Request) => {
                  if (failedReq.url() === req.url()) {
                    page.off('response', handleResponse)
                    page.off('requestfailed', handleFailure)
                    error.message = `Request failed: ${failedReq.failure()?.errorText || 'Unknown error'}\n\nURL: ${req.url()}`
                    reject(error)
                  }
                }
                page.on('response', handleResponse)
                page.on('requestfailed', handleFailure)
              })
            })
          }
        }

        // After flushing the queue, wait for the microtask queue to be
        // exhausted, then check if any additional requests are initiated. A
        // single macrotask should be enough because if the router queue is
        // network throttled, the next request is issued either directly within
        // the task of the previous request's completion event, or in the
        // microtask queue of that event.
        await waitForIdleCallback()

        await waitForPendingRequestChecks()
      }

      if (didHardNavigate) {
        error.message =
          'A hard navigation or refresh was triggerd during the `act` scope. ' +
          'This is not supported.'
        throw error
      }

      if (expectedResponses !== null) {
        // Assert that the responses were received in the expected order
        if (!equals(actualResponses, expectedResponses)) {
          // Print a helpful error message.

          if (expectedResponses.length === 1) {
            error.message =
              'Expected a response containing the given string:\n\n' +
              expectedResponses[0].includes +
              '\n'
          } else {
            const expectedSubstrings = expectedResponses.map(
              (item) => item.includes
            )
            const actualSubstrings = actualResponses.map(
              (item) => item.includes
            )
            error.message =
              'Expected sequence of responses does not match:\n\n' +
              diff(expectedSubstrings, actualSubstrings) +
              '\n\n' +
              'NOTE: Assertions are checked in order, so if an expectation ' +
              'is missing, it may have actually appeared earlier in the ' +
              'sequence than expected. Make sure the order is correct.'
          }

          // If any unclaimed expectation's substring did appear in a response,
          // but a response of a different kind, call that out explicitly —
          // it's the most likely explanation for the failure.
          for (const [expectation, actualKind] of wrongKindMatches) {
            if (claimedExpectations.has(expectation)) {
              continue
            }
            const receivedIn =
              actualKind === undefined
                ? 'a response with no prefetch kind (a navigation, Server ' +
                  'Action, or plain prefetch)'
                : `a '${actualKind}' response`
            error.message +=
              '\n\n' +
              `NOTE: The expected substring "${expectation.includes}" was ` +
              `received in ${receivedIn}, but the expectation requires ` +
              `kind: '${expectation.kind}'.`
          }

          throw error
        }
      }

      // Some of the requests were blocked. Transfer them to the outer `act`
      // batch so it can flush them.
      if (remaining.size !== 0 && prevBatch !== null) {
        for (const item of remaining) {
          prevBatch.pendingRequests.add(item)
        }
        // The outer batch inherits pending work, so its "at least one
        // request" check is satisfied.
        prevBatch.didReceiveRouterRequest = true
      }

      return returnValue
    } finally {
      // Clean up
      currentBatch = prevBatch
      await page.unroute('**/*', routeHandler)
      page.off('framedetached', hardNavigationHandler)
    }
  }

  return act
}
