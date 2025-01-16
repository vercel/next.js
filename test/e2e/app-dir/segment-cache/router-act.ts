import type * as Playwright from 'playwright'
import { diff } from 'jest-diff'
import { equals } from '@jest/expect-utils'

type Batch = {
  pendingRequestChecks: Set<Promise<void>>
  pendingRequests: Set<PendingRSCRequest>
}

type PendingRSCRequest = {
  route: Playwright.Route
  result: Promise<{ body: string; headers: Record<string, string> }>
  didProcess: boolean
}

let currentBatch: Batch | null = null

type ExpectedResponseConfig = { includes: string; block?: boolean | 'reject' }

/**
 * Represents the expected responses sent by the server to fulfill requests
 * initiated by the `scope` function.
 *
 * - `includes` is a substring of an expected response body.
 * - `block` indicates whether the response should not yet be sent to the
 *   client. This option is only supported when nested inside an outer `act`
 *   scope. The blocked response will be fulfilled when the outer
 *   scope completes.
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
  page: Playwright.Page
): <T>(scope: () => Promise<T> | T, config?: ActConfig) => Promise<T> {
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
    let shouldBlockAll = false
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

        if (isRouterRequest) {
          // This request was initiated by the Next.js Router. Intercept it and
          // add it to the current batch.
          pendingRequests.add({
            route,
            // `act` controls the timing of when responses reach the client,
            // but it should not affect the timing of when requests reach the
            // server; we pass the request to the server the immediately.
            result: new Promise(async (resolve) => {
              const originalResponse = await page.request.fetch(request)
              resolve({
                body: await originalResponse.text(),
                headers: originalResponse.headers(),
              })
            }),
            didProcess: false,
          })
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
      await Promise.all(
        Array.from(orphanedRequests).map((item) => item.route.continue())
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
    }
    currentBatch = batch
    await page.route('**/*', routeHandler)
    await page.on('framedetached', hardNavigationHandler)
    try {
      // Call the user-provided scope function
      const returnValue = await scope()

      // Wait until the first request is initiated, up to some timeout.
      if (expectedResponses !== null && batch.pendingRequests.size === 0) {
        await new Promise<void>((resolve, reject) => {
          const timerId = setTimeout(() => {
            error.message = 'Timed out waiting for a request to be initiated.'
            reject(error)
          }, 500)
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
      // We use requestAnimationFrame to schedule the task because that's
      // guaranteed to fire after any IntersectionObserver events, which the
      // router uses to track the visibility of links.
      await page.evaluate(
        () => new Promise<void>((res) => requestAnimationFrame(() => res()))
      )

      // Checking whether a request needs to be intercepted is an async
      // operation, so we need to wait for all the checks to complete before
      // checking whether the queue is empty.
      await waitForPendingRequestChecks()

      // Because responding to one request may unblock additional requests,
      // keep checking for more requests until the queue has settled.
      const remaining = new Set<PendingRSCRequest>()
      let actualResponses: Array<ExpectedResponseConfig> = []
      let alreadyMatched = new Map<string, string>()
      while (batch.pendingRequests.size > 0) {
        const pending = batch.pendingRequests
        batch.pendingRequests = new Set()
        for (const item of pending) {
          const route = item.route
          const request = route.request()

          let shouldBlock = false
          const fulfilled = await item.result
          if (item.didProcess) {
            // This response was already processed by an inner `act` call.
          } else {
            item.didProcess = true
            if (expectedResponses === null) {
              error.message = 'Expected no network requests to be initiated.'
              throw error
            }
            if (expectedResponses !== null) {
              let alreadyMatchedByThisResponse: string | null = null
              for (const expectedResponse of expectedResponses) {
                const includes = expectedResponse.includes
                const block = expectedResponse.block
                if (fulfilled.body.includes(includes)) {
                  if (block === 'reject') {
                    error.message = `
Received a response containing an unexpected substring:

Rejected substring: ${includes}

Response:
${fulfilled.body}
`
                    throw error
                  }

                  // Match. Don't check yet whether the responses are received
                  // in the expected order. Instead collect all the matches and
                  // check at the end so we can include a diff in the
                  // error message.
                  if (alreadyMatchedByThisResponse) {
                    error.message = `
Received a response that includes both of the following substrings.

Expected substrings:
- ${alreadyMatchedByThisResponse}
- ${includes}

Response:
${fulfilled.body}

Choose more specific substrings to assert on.
`
                    throw error
                  }
                  const otherResponse = alreadyMatched.get(includes)
                  if (otherResponse !== undefined) {
                    error.message = `
Received multiple responses containing the same expected substring.

Expected substring:
${includes}

Responses:

${otherResponse}

${fulfilled.body}

Choose a more specific substring to assert on.
`
                    throw error
                  }
                  alreadyMatchedByThisResponse = includes
                  alreadyMatched.set(includes, fulfilled.body)
                  if (actualResponses === null) {
                    actualResponses = [expectedResponse]
                  } else {
                    actualResponses.push(expectedResponse)
                  }
                  if (block) {
                    shouldBlock = true
                  }
                  // Keep checking all the expected responses to verify there
                  // are no duplicate matches
                }
              }
            }
          }

          if (shouldBlock || shouldBlockAll) {
            // This response was blocked by the `block` option. Don't
            // fulfill it yet.
            remaining.add(item)
          } else {
            await route.fulfill(fulfilled)
            const browserResponse = await request.response()
            if (browserResponse !== null) {
              await browserResponse.finished()
            }
          }
        }

        // After flushing the queue, wait for the microtask queue to be
        // exhausted, then check if any additional requests are initiated. A
        // microtask should be enough because if the router queue is network
        // throttled, the next request is issued within a microtask of the
        // previous one finishing.
        await page.evaluate(() => Promise.resolve())

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
              '\n'
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
      }

      return returnValue
    } finally {
      // Clean up
      currentBatch = prevBatch
      await page.unroute('**/*', routeHandler)
      await page.off('framedetached', hardNavigationHandler)
    }
  }

  return act
}
