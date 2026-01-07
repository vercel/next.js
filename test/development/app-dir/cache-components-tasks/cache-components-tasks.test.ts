import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import * as nodePath from 'node:path'
import type { Playwright } from '../../../lib/next-webdriver'

describe.each([
  {
    description: 'without runtime prefetch configs',
    hasRuntimePrefetch: false,
    fixturePath: 'fixtures/without-prefetch-config',
  },
  {
    description: 'with runtime prefetch configs',
    hasRuntimePrefetch: true,
    fixturePath: 'fixtures/with-prefetch-config',
  },
])(
  'cache-components-tasks - $description',
  ({ fixturePath, hasRuntimePrefetch }) => {
    const { next, isTurbopack, isNextDev } = nextTestSetup({
      files: nodePath.join(__dirname, fixturePath),
    })

    function assertLog(
      logs: Array<{ source: string; message: string }>,
      message: string,
      expectedEnvironment: string
    ) {
      // Match logs that contain the message, with any environment.
      const logPattern = new RegExp(
        `^(?=.*\\b${message}\\b)(?=.*\\b(Cache|Prerender|Prefetch|Prefetchable|Server)\\b).*`
      )
      const logMessages = logs.map((log) => log.message)
      const messages = logMessages.filter((message) => logPattern.test(message))

      // If there's zero or more than one logs that match, the test is not set up correctly.
      if (messages.length === 0) {
        throw new Error(
          `Found no logs matching '${message}':\n\n${logMessages.map((s, i) => `${i}. ${s}`).join('\n')}}`
        )
      }
      if (messages.length > 1) {
        throw new Error(
          `Found multiple logs matching '${message}':\n\n${messages.map((s, i) => `${i}. ${s}`).join('\n')}`
        )
      }

      // The message should have the expected environment.
      const actualMessageText = messages[0]
      const [, actualEnvironment] = actualMessageText.match(logPattern)!
      expect([actualEnvironment, actualMessageText]).toEqual([
        expectedEnvironment,
        expect.stringContaining(message),
      ])
    }

    function assertNoUnexpectedErrorsInCli() {
      // We should not see any errors related to the aborted render.
      expect(next.cliOutput).not.toContain(
        'AbortError: This operation was aborted'
      )
      // We should not see warnings related to setTimeout.
      expect(next.cliOutput).not.toContain(
        "Next.js cannot guarantee that Cache Components will run as expected due to the current runtime's implementation of `setTimeout()`"
      )
    }

    async function testInitialLoad(
      path: string,
      assertLogs: (browser: Playwright) => Promise<void>
    ) {
      const browser = await next.browser(path)

      // Initial load.
      await retry(() => assertLogs(browser))
      assertNoUnexpectedErrorsInCli()

      // After another load (with warm caches) the logs should be the same.
      await browser.loadPage(next.url + path) // clears old logs
      await retry(() => assertLogs(browser))
      assertNoUnexpectedErrorsInCli()

      if (isNextDev && isTurbopack) {
        // FIXME:
        // In Turbopack, requests to the /revalidate route seem to occasionally crash
        // due to some HMR or compilation issue. `revalidatePath` throws this error:
        //
        //   Invariant: static generation store missing in revalidatePath <path>
        //
        // This is unrelated to the logic being tested here, so for now, we skip the assertions
        // that require us to revalidate.
        console.log('WARNING: skipping revalidation assertions in turbopack')
        return
      }

      // After a revalidation the subsequent warmup render must discard stale
      // cache entries.
      // This should not affect the environment labels.
      await revalidatePath(path)

      await browser.loadPage(next.url + path) // clears old logs
      await retry(() => assertLogs(browser))
      assertNoUnexpectedErrorsInCli()
    }

    async function testNavigation(
      path: string,
      assertLogs: (browser: Playwright) => Promise<void>
    ) {
      const browser = await next.browser('/')

      // Initial nav (first time loading the page)
      await browser.elementByCss(`a[href="${path}"]`).click()
      await retry(() => assertLogs(browser))
      assertNoUnexpectedErrorsInCli()

      // Reload, and perform another nav (with warm caches). the logs should be the same.
      await browser.loadPage(next.url + '/') // clears old logs
      await browser.elementByCss(`a[href="${path}"]`).click()
      await retry(() => assertLogs(browser))
      assertNoUnexpectedErrorsInCli()

      if (isNextDev && isTurbopack) {
        // FIXME:
        // In Turbopack, requests to the /revalidate route seem to occasionally crash
        // due to some HMR or compilation issue. `revalidatePath` throws this error:
        //
        //   Invariant: static generation store missing in revalidatePath <path>
        //
        // This is unrelated to the logic being tested here, so for now, we skip the assertions
        // that require us to revalidate.
        console.log('WARNING: skipping revalidation assertions in turbopack')
        return
      }

      // After a revalidation the subsequent warmup render must discard stale
      // cache entries.
      // This should not affect the environment labels.
      await revalidatePath(path)

      await browser.loadPage(next.url + '/') // clears old logs
      await browser.elementByCss(`a[href="${path}"]`).click()
      await retry(() => assertLogs(browser))
      assertNoUnexpectedErrorsInCli()
    }

    async function revalidatePath(path: string) {
      const response = await next.fetch(
        `/revalidate?path=${encodeURIComponent(path)}`
      )
      if (!response.ok) {
        throw new Error(
          `Failed to revalidate path: '${path}' - server responded with status ${response.status}`
        )
      }
    }

    const RUNTIME_ENV = hasRuntimePrefetch ? 'Prefetch' : 'Prefetchable'

    describe.each([
      { description: 'initial load', isInitialLoad: true },
      { description: 'navigation', isInitialLoad: false },
    ])('$description', ({ isInitialLoad }) => {
      it('setImmediate resolves between tasks', async () => {
        const path = '/simple'
        const assertLogs = async (browser: Playwright) => {
          const logs = await browser.log()
          assertLog(logs, 'after immediate - static - layout', 'Prerender')
          assertLog(logs, 'after immediate - static - page', 'Prerender')

          assertLog(logs, 'after cookies - layout', RUNTIME_ENV)
          assertLog(logs, 'after cookies - page', RUNTIME_ENV)
          assertLog(logs, 'after immediate - runtime - layout', RUNTIME_ENV)
          assertLog(logs, 'after immediate - runtime - page', RUNTIME_ENV)

          assertLog(logs, 'after connection - layout', 'Server')
          assertLog(logs, 'after connection - page', 'Server')
          assertLog(logs, 'after immediate - dynamic - layout', 'Server')
          assertLog(logs, 'after immediate - dynamic - page', 'Server')
        }

        if (isInitialLoad) {
          await testInitialLoad(path, assertLogs)
        } else {
          await testNavigation(path, assertLogs)
        }
      })
    })
  }
)
