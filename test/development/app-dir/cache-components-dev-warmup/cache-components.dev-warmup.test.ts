import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'
import * as nodePath from 'node:path'

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
  'cache-components-dev-warmup - $description',
  ({ fixturePath, hasRuntimePrefetch }) => {
    const { next, isTurbopack } = nextTestSetup({
      files: nodePath.join(__dirname, fixturePath),
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

    async function testInitialLoad(
      path: string,
      assertLogs: (browser: Playwright) => Promise<void>
    ) {
      const browser = await next.browser(path)

      // The initial load fills caches while streaming, so cached content
      // resolves in a later phase than it will once the caches are warm. That's
      // an accepted, non-representative tradeoff of the streaming dev render,
      // so we don't assert the logs here — this load just fills the caches.

      // We should not see any errors related to the aborted render.
      expect(next.cliOutput).not.toContain(
        'AbortError: This operation was aborted'
      )

      // After a warm reload the caches are filled, so the logs resolve in the
      // correct phase.
      await browser.loadPage(next.url + path) // clears old logs
      await retry(() => assertLogs(browser))

      expect(next.cliOutput).not.toContain(
        'AbortError: This operation was aborted'
      )

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

      // After a revalidation the subsequent render must discard the stale cache
      // entries. This should not affect the environment labels once the caches
      // are warm again.
      await revalidatePath(path)

      // The first load after revalidation is a cold cache-miss request that we
      // stream, so its stages aren't representative; it just refills the
      // caches.
      await browser.loadPage(next.url + path)

      // After a warm reload the caches are filled, so the logs resolve in the
      // correct phase.
      await browser.loadPage(next.url + path) // clears old logs
      await retry(() => assertLogs(browser))

      // We should not see any errors related to the aborted render.
      expect(next.cliOutput).not.toContain(
        'AbortError: This operation was aborted'
      )
    }

    async function testNavigation(
      path: string,
      assertLogs: (browser: Playwright) => Promise<void>
    ) {
      const browser = await next.browser('/')

      // The initial nav fills caches while streaming, so cached content
      // resolves in a later phase than it will once the caches are warm. That's
      // an accepted, non-representative tradeoff of the streaming dev render,
      // so we don't assert the logs here — this nav just fills the caches.
      const initialNavOutputIndex = next.cliOutput.length
      await browser.elementByCss(`a[href="${path}"]`).click()
      // Wait for the nav's request to finish before reloading, to ensure all
      // caches were filled.
      await retry(() => {
        expect(next.cliOutput.slice(initialNavOutputIndex)).toContain(
          `GET ${path} 200`
        )
      }, 10_000)

      // We should not see any errors related to the aborted render.
      expect(next.cliOutput).not.toContain(
        'AbortError: This operation was aborted'
      )

      // After a warm reload + nav the caches are filled, so the logs resolve in
      // the correct phase.
      await browser.loadPage(next.url + '/') // clears old logs
      await browser.elementByCss(`a[href="${path}"]`).click()
      await retry(() => assertLogs(browser))

      expect(next.cliOutput).not.toContain(
        'AbortError: This operation was aborted'
      )

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

      // After a revalidation the subsequent render must discard the stale cache
      // entries. This should not affect the environment labels once the caches
      // are warm again.
      await revalidatePath(path)

      // The first navigation after revalidation is a cold cache-miss request
      // that we stream, so its stages aren't representative; it just refills
      // the caches. Wait for its request to finish before navigating again.
      await browser.loadPage(next.url + '/')
      const revalidatedNavOutputIndex = next.cliOutput.length
      await browser.elementByCss(`a[href="${path}"]`).click()
      await retry(() => {
        expect(next.cliOutput.slice(revalidatedNavOutputIndex)).toContain(
          `GET ${path} 200`
        )
      }, 10_000)

      // After a warm reload + nav the caches are filled, so the logs resolve in
      // the correct phase.
      await browser.loadPage(next.url + '/') // clears old logs
      await browser.elementByCss(`a[href="${path}"]`).click()
      await retry(() => assertLogs(browser))

      expect(next.cliOutput).not.toContain(
        'AbortError: This operation was aborted'
      )
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
            assertLog(logs, 'after private cache read - page', RUNTIME_ENV)
            assertLog(logs, 'after private cache read - layout', RUNTIME_ENV)
            assertLog(
              logs,
              'after successive private cache reads - page',
              RUNTIME_ENV
            )

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
            assertLog(logs, 'after short-lived cache read - page', RUNTIME_ENV)
            assertLog(
              logs,
              'after short-lived cache read - layout',
              RUNTIME_ENV
            )

            assertLog(logs, 'after uncached fetch - layout', 'Server')
            assertLog(logs, 'after uncached fetch - page', 'Server')
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })

        it('cached data + short-stale cached data', async () => {
          const path = '/short-stale-cache'

          // A short stale time excludes the entry from both the runtime prefetch
          // shell and the static shell.

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()
            assertLog(logs, 'after cache read - layout', 'Prerender')
            assertLog(logs, 'after cache read - page', 'Prerender')

            assertLog(logs, 'after short-stale cache read - page', 'Server')
            assertLog(logs, 'after short-stale cache read - layout', 'Server')

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

          // TODO: we should only label this as "Prefetch" if there's a prefetch config.
          assertLog(logs, `after cookies`, RUNTIME_ENV)
          assertLog(logs, `after headers`, RUNTIME_ENV)
          assertLog(logs, `after params`, RUNTIME_ENV)
          assertLog(logs, `after searchParams`, RUNTIME_ENV)

          assertLog(logs, 'after connection', 'Server')
        }

        if (isInitialLoad) {
          await testInitialLoad(path, assertLogs)
        } else {
          await testNavigation(path, assertLogs)
        }
      })

      describe('mixed static and fallback params resolve in the correct phase', () => {
        it('covered leading param', async () => {
          const path = '/mixed/en/123'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()
            // `en` is covered by `generateStaticParams`, so `lang` resolves in
            // the static shell.
            assertLog(logs, 'after params - lang', 'Prerender')
            // `id` is never covered, so it's deferred to the runtime stage.
            assertLog(logs, 'after params - id', RUNTIME_ENV)
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })

        it('uncovered leading param', async () => {
          const path = '/mixed/fr/123'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()
            // `fr` is not covered by `generateStaticParams`, so the most-specific
            // prerendered route matching this URL is the base route and its
            // fallback set is both params. `lang` must therefore defer to the
            // runtime stage too, not resolve in the static shell. (Picking the
            // fewest-param route without matching the URL would resolve `lang`
            // in `Prerender` here.)
            assertLog(logs, 'after params - lang', RUNTIME_ENV)
            assertLog(logs, 'after params - id', RUNTIME_ENV)
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })

        it('fully covered params', async () => {
          const path = '/mixed/en/x'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()
            // Both `en` and `x` are covered by `generateStaticParams`, so this
            // is a fully prerendered concrete route and both params resolve in
            // the static shell. (Skipping the concrete route before matching
            // the URL would let the base route win and defer the
            // statically-known `id`.)
            assertLog(logs, 'after params - lang', 'Prerender')
            assertLog(logs, 'after params - id', 'Prerender')
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })
      })

      // FIXME: it seems like in Turbopack we sometimes get two instances of `workUnitAsyncStorage` --
      // `app-render` gets a second, newer instance, different from `io()`.
      // Thus, `io()` gets an undefined `workUnitStore` and does nothing, so sync IO does not get tracked at all.
      // This is likely caused by the same bug that breaks `/revalidate` (see other FIXME above),
      // where a route crashes due to a missing `workStore`.
      if (!isTurbopack) {
        it('sync IO in the static phase', async () => {
          const path = '/sync-io/static'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()

            assertLog(logs, 'after first cache', 'Prerender')
            // sync IO in the static stage errors and advances to Server.
            assertLog(logs, 'after sync io', 'Server')
            assertLog(logs, 'after cache read - page', 'Server')
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })

        it('sync IO in the runtime phase', async () => {
          const path = '/sync-io/runtime'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()

            assertLog(logs, 'after first cache', 'Prerender')
            assertLog(logs, 'after cookies', RUNTIME_ENV)
            if (hasRuntimePrefetch) {
              // if runtime prefetching is on, sync IO in the runtime stage errors and advances to Server.
              assertLog(logs, 'after sync io', 'Server')
              assertLog(logs, 'after cache read - page', 'Server')
            } else {
              // if runtime prefetching is not on, sync IO in the runtime stage does nothing.
              assertLog(logs, 'after sync io', RUNTIME_ENV)
              assertLog(logs, 'after cache read - page', RUNTIME_ENV)
            }
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })
      }
    })
  }
)
