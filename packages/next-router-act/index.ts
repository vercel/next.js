/**
 * Playwright-side orchestrator for @next/router-act.
 *
 * This module provides `createRouterAct`, which returns an `act()` function
 * for controlling the timing of Next.js Router network requests in e2e tests.
 * The bulk of the work (scheduling, response matching, resolve/block
 * decisions) happens in the browser via setup.ts. This orchestrator is
 * responsible for:
 *
 * - Parsing the ActConfig into normalized form
 * - Validating nesting constraints (e.g., 'block' requires an outer act)
 * - Driving the lifecycle via page.evaluate() calls (3 per act scope)
 * - Formatting errors with proper stack traces for test output
 * - Final sequence assertions using jest utilities
 */

import type * as Playwright from 'playwright'
import { diff } from 'jest-diff'
import { equals } from '@jest/expect-utils'

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

type ExpectedResponseConfig = {
  includes: string
  block?: boolean | 'reject'
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
  }
): <T>(scope: () => Promise<T> | T, config?: ActConfig) => Promise<T> {
  const allowStatuses = options?.allowErrorStatusCodes ?? null

  // Nesting depth is tracked per createRouterAct instance (i.e., per page)
  // so that multi-page tests don't interfere with each other's validation.
  let nestingDepth = 0

  async function act<T>(
    scope: () => Promise<T> | T,
    config?: ActConfig
  ): Promise<T> {
    // Capture a stack trace for better async error messages. When we throw
    // later, we reuse this Error so the stack points to the act() call
    // site rather than deep inside the implementation.
    const error = new Error()
    if (Error.captureStackTrace) {
      Error.captureStackTrace(error, act)
    }

    // Parse the ActConfig into normalized form:
    // - expectedResponses: array of expected configs, or null for 'no-requests'
    // - forbiddenResponses: array of configs with block='reject'
    // - shouldBlockAll: true for the 'block' shorthand
    let expectedResponses: Array<ExpectedResponseConfig> | null
    let forbiddenResponses: Array<ExpectedResponseConfig> = []
    let shouldBlockAll = false

    if (config === undefined || config === null) {
      expectedResponses = []
    } else if (config === 'block') {
      if (nestingDepth === 0) {
        error.message =
          '`block` option only supported when nested inside an outer ' +
          '`act` scope.'
        throw error
      }
      expectedResponses = []
      shouldBlockAll = true
    } else if (config === 'no-requests') {
      expectedResponses = null
    } else if (!Array.isArray(config)) {
      if (config.block === true && nestingDepth === 0) {
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
        if (item.block === true && nestingDepth === 0) {
          error.message =
            '`block: true` option only supported when nested inside an outer ' +
            '`act` scope.'
          throw error
        }
        if (item.block !== 'reject') {
          expectedResponses.push(item)
        } else {
          forbiddenResponses.push(item)
        }
      }
    }

    // Wait for the <RouterAct /> component to mount (installs
    // window.__ROUTER_ACT) and start a new batch. Combined into a single
    // page.evaluate() to minimize round trips. After a page refresh or
    // hard navigation, the component needs to re-hydrate before
    // __ROUTER_ACT is available, hence the polling.
    const started = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          if ('__ROUTER_ACT' in window) {
            window.__ROUTER_ACT.startBatch()
            resolve(true)
            return
          }
          let elapsed = 0
          const interval = setInterval(() => {
            elapsed += 50
            if ('__ROUTER_ACT' in window) {
              clearInterval(interval)
              window.__ROUTER_ACT.startBatch()
              resolve(true)
            } else if (elapsed >= 5000) {
              clearInterval(interval)
              resolve(false)
            }
          }, 50)
        })
    )
    if (!started) {
      error.message =
        'window.__ROUTER_ACT is not available. Make sure the ' +
        '<RouterAct /> component is rendered in your test fixture.'
      throw error
    }
    nestingDepth++

    // Detect hard navigations (page refresh, MPA navigation) that
    // destroy the execution context during the act scope. This matches
    // the old router-act implementation's behavior.
    let didHardNavigate = false
    const hardNavigationHandler = () => {
      didHardNavigate = true
    }
    page.on('framedetached', hardNavigationHandler)

    try {
      const returnValue = await scope()

      // Translate the Playwright-side config into the browser-side config.
      // Key mappings:
      // - block='reject' configs → forbiddenIncludes (checked separately)
      // - block=true configs → expectedIncludes with block=true
      // - 'no-requests' → noRequests=true, empty expectedIncludes
      // - waitForFirstRequestMs is 500ms when we expect requests, null
      //   when we expect no requests ('no-requests' mode)
      const drainConfig: DrainQueueConfig = {
        expectedIncludes: (expectedResponses ?? []).map((r) => ({
          includes: r.includes,
          block: r.block === true,
        })),
        forbiddenIncludes: forbiddenResponses.map((r) => r.includes),
        allowErrorStatusCodes: allowStatuses ?? [],
        shouldBlockAll,
        noRequests: expectedResponses === null,
        waitForFirstRequestMs: expectedResponses !== null ? 500 : null,
      }

      const result: DrainQueueResult = await page.evaluate(
        (cfg) => window.__ROUTER_ACT.drainQueue(cfg),
        drainConfig
      )

      if (didHardNavigate) {
        error.message =
          'A hard navigation or refresh was triggered during the `act` ' +
          'scope. This is not supported.'
        throw error
      }

      // Handle errors from the browser-side drain. The browser returns
      // structured error info; we format it into a readable error message
      // with the stack trace pointing to the act() call site.
      if (result.error) {
        const e = result.error
        switch (e.type) {
          case 'timed-out':
            error.message = 'Timed out waiting for a request to be initiated.'
            throw error
          case 'unexpected-request':
            error.message = `
Expected no network requests to be initiated.

URL: ${e.url}
Headers: ${JSON.stringify(e.headers)}

Response:
${e.bodyText}
`
            throw error
          case 'error-status':
            error.message = `
Received a response with an error status code.

Status: ${e.status}
URL: ${e.url}
Headers: ${JSON.stringify(e.headers)}

Response:
${e.bodyText}
`
            throw error
          case 'forbidden-match':
            error.message = `
Received a response containing an unexpected substring:

Rejected substring: ${e.substring}

Response:
${e.bodyText}
`
            throw error
          case 'duplicate-match':
            error.message = `
The same expected substring was sent multiple times by the server:

${e.substring}

Choose a more specific substring to assert on.
`
            throw error
          default: {
            const exhaustive: never = e.type
            throw new Error(`Unhandled error type: ${exhaustive}`)
          }
        }
      }

      // Assert that the responses were received in the expected order.
      // The browser returned indices into the expectedIncludes array
      // indicating which expectations were matched. We reconstruct the
      // matched configs and compare against the full expected list using
      // jest's deep equality.
      if (expectedResponses !== null && expectedResponses.length > 0) {
        const actualResponses = result.matchedIndices.map(
          (i) => expectedResponses![i]
        )
        if (!equals(actualResponses, expectedResponses)) {
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
          throw error
        }
      }

      return returnValue
    } finally {
      nestingDepth--
      page.off('framedetached', hardNavigationHandler)
      // End the batch — blocked requests get transferred to parent.
      // If the page context was destroyed (hard navigation/refresh),
      // the evaluate will fail. Swallow the error since the batch and
      // its requests are gone with the old page context anyway.
      await page.evaluate(() => window.__ROUTER_ACT?.endBatch()).catch(() => {})
    }
  }

  return act
}
