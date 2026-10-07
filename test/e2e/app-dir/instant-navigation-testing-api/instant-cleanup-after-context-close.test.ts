/**
 * Regression coverage for instant()'s cleanup when the browser context is
 * already gone.
 *
 * When a wait inside an instant() scope never settles, the Playwright test
 * times out and Playwright tears the browser context down before the pending
 * callback rejection surfaces. instant()'s `finally` then runs
 * "Release Instant Lock", whose first step reads `context.cookies()`. On a
 * closed context that read rejects, and because it rejects inside the
 * `finally` it REPLACES the original failure: the reported error is a browser
 * context failure instead of the in-scope timeout that actually broke the test.
 *
 * The assertion below pins that current (incorrect) behavior. The fix is to
 * skip (or swallow) the cookie cleanup once the context is closed, so the
 * original error propagates — which will require updating this expectation.
 */

import { nextTestSetup, type Playwright as NextBrowser } from 'e2e-utils'
import { instant } from '@next/playwright'
import type * as Playwright from 'playwright'
import { join } from 'node:path'

describe('instant-navigation-testing-api - cleanup after the context is closed', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixtures', 'default'),
  })

  it('reports the cookie cleanup failure instead of the error raised inside the scope', async () => {
    let hostPage: Playwright.Page
    const browser: NextBrowser = await next.browser('/', {
      beforePageLoad(p: Playwright.Page) {
        hostPage = p
      },
    })
    expect(browser).toBeDefined()

    // Use a dedicated browser context so closing it (to emulate Playwright's
    // teardown on a test timeout) does not disturb the shared test browser.
    const playwrightBrowser = hostPage!.context().browser()
    if (!playwrightBrowser) {
      throw new Error('Expected the page context to expose a browser instance')
    }
    const context = await playwrightBrowser.newContext()
    const page = await context.newPage()

    try {
      await page.goto(next.url)

      // Stands in for the pending in-scope wait that the Playwright test
      // timeout aborts (e.g. a locator that can never commit under the lock).
      const inScopeError = new Error('locator.waitFor: Timeout 1000ms exceeded')

      let caught: Error | undefined
      try {
        await instant(page, async () => {
          // Playwright closes the browser context as part of tearing the timed
          // out test down, while the callback's own failure is still in flight.
          await context.close()
          throw inScopeError
        })
      } catch (e) {
        caught = e as Error
      }

      expect(caught).toBeDefined()

      // Current behavior: the "Release Instant Lock" cleanup calls
      // `context.cookies()` on the closed context, and its rejection masks the
      // in-scope error.
      expect(caught!.message).toContain('browserContext.cookies')
      expect(caught!.message).not.toContain('Timeout 1000ms exceeded')
    } finally {
      await context.close()
    }
  })
})
