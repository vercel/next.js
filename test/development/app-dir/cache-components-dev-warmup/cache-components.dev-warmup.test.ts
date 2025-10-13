import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import type { Playwright } from '../../../lib/next-webdriver'

describe('cache-components-dev-warmup', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // Restart the dev server for each test to clear the in-memory cache.
  // We're testing cache-warming behavior here, so we don't want tests to interfere with each other.
  let isFirstTest = true
  beforeEach(async () => {
    if (isFirstTest) {
      // There's no point restarting if this is the first test.
      isFirstTest = false
      return
    }

    await next.stop()
    await next.clean()
    await next.start()
  })

  function assertLog(
    logs: Array<{ source: string; message: string }>,
    message: string,
    expectedEnvironment: string
  ) {
    // Match logs that contain the message, with any environment.
    const logPattern = new RegExp(
      `^(?=.*\\b${message}\\b)(?=.*\\b(Cache|Prerender|Server)\\b).*`
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

  async function testInitialLoad(
    path: string,
    assertLogs: (browser: Playwright) => Promise<void>
  ) {
    const browser = await next.browser(path)

    // Initial load.
    await retry(() => assertLogs(browser))

    // After another load (with warm caches) the logs should be the same.
    await browser.loadPage(next.url + path) // clears old logs
    await retry(() => assertLogs(browser))

    if (isTurbopack) {
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
  }

  async function testNavigation(
    path: string,
    assertLogs: (browser: Playwright) => Promise<void>
  ) {
    const browser = await next.browser('/')

    // Initial nav (first time loading the page)
    await browser.elementByCss(`a[href="${path}"]`).click()
    await retry(() => assertLogs(browser))

    // Reload, and perform another nav (with warm caches). the logs should be the same.
    await browser.loadPage(next.url + '/') // clears old logs
    await browser.elementByCss(`a[href="${path}"]`).click()
    await retry(() => assertLogs(browser))

    if (isTurbopack) {
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

  describe.each([
    { description: 'initial load', isInitialLoad: true },
    { description: 'navigation', isInitialLoad: false },
  ])('$description', ({ isInitialLoad }) => {
    describe('cached data resolves in the correct phase', () => {
      it('cached data + cached fetch', async () => {
        const path = '/simple'
        const assertLogs = async (browser: Playwright) => {
          const logs = await browser.log()
          assertLog(logs, 'after cache read - layout', 'Prerender')
          assertLog(logs, 'after cache read - page', 'Prerender')
          assertLog(logs, 'after successive cache reads - page', 'Prerender')
          assertLog(logs, 'after cached fetch - layout', 'Prerender')
          assertLog(logs, 'after cached fetch - page', 'Prerender')

          assertLog(logs, 'after uncached fetch - layout', 'Server')
          assertLog(logs, 'after uncached fetch - page', 'Server')
        }

        if (isInitialLoad) {
          await testInitialLoad(path, assertLogs)
        } else {
          await testNavigation(path, assertLogs)
        }
      })

      it('cached data + private cache', async () => {
        const path = '/private-cache'

        const assertLogs = async (browser: Playwright) => {
          const logs = await browser.log()
          assertLog(logs, 'after cache read - layout', 'Prerender')
          assertLog(logs, 'after cache read - page', 'Prerender')

          // Private caches are dynamic holes in static prerenders,
          // so they shouldn't resolve in the static stage.
          assertLog(logs, 'after private cache read - page', 'Server') // TODO: 'Runtime Prerender'
          assertLog(logs, 'after private cache read - layout', 'Server') // TODO: 'Runtime Prerender'
          assertLog(
            logs,
            'after successive private cache reads - page',
            'Server'
          ) // TODO: 'Runtime Prerender'

          assertLog(logs, 'after uncached fetch - layout', 'Server')
          assertLog(logs, 'after uncached fetch - page', 'Server')
        }

        if (isInitialLoad) {
          await testInitialLoad(path, assertLogs)
        } else {
          await testNavigation(path, assertLogs)
        }
      })

      it('cached data + short-lived cached data', async () => {
        const path = '/short-lived-cache'

        const assertLogs = async (browser: Playwright) => {
          const logs = await browser.log()
          assertLog(logs, 'after cache read - layout', 'Prerender')
          assertLog(logs, 'after cache read - page', 'Prerender')

          // Short lived caches are dynamic holes in static prerenders,
          // so they shouldn't resolve in the static stage.
          assertLog(logs, 'after short-lived cache read - page', 'Server')
          assertLog(logs, 'after short-lived cache read - layout', 'Server')

          assertLog(logs, 'after uncached fetch - layout', 'Server')
          assertLog(logs, 'after uncached fetch - page', 'Server')
        }

        if (isInitialLoad) {
          await testInitialLoad(path, assertLogs)
        } else {
          await testNavigation(path, assertLogs)
        }
      })

      it('cache reads that reveal more components with more caches', async () => {
        const path = '/successive-caches'

        const assertLogs = async (browser: Playwright) => {
          const logs = await browser.log()
          // No matter how deeply we nest the component tree,
          // if all the IO is cached, it should be labeled as Prerender.
          assertLog(logs, 'after cache 1', 'Prerender')
          assertLog(logs, 'after cache 2', 'Prerender')
          assertLog(logs, 'after caches 1 and 2', 'Prerender')
          assertLog(logs, 'after cache 3', 'Prerender')
        }

        if (isInitialLoad) {
          await testInitialLoad(path, assertLogs)
        } else {
          await testNavigation(path, assertLogs)
        }
      })
    })

    it('request APIs resolve in the correct phase', async () => {
      const path = '/apis/123'

      const assertLogs = async (browser: Playwright) => {
        const logs = await browser.log()
        assertLog(logs, 'after cache read - page', 'Prerender')

        for (const apiName of [
          'cookies',
          'headers',
          // TODO(restart-on-cache-miss): these two are currently broken/flaky,
          // because they're created outside of render and can resolve too early.
          // This will be fixed in a follow-up.
          // 'params',
          // 'searchParams',
          'connection',
        ]) {
          assertLog(logs, `after ${apiName}`, 'Server')
        }
      }

      if (isInitialLoad) {
        await testInitialLoad(path, assertLogs)
      } else {
        await testNavigation(path, assertLogs)
      }
    })
  })
})
