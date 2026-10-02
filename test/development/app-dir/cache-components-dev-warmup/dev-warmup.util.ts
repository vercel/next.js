import { nextTestSetup, type Playwright } from 'e2e-utils'
import { retry } from 'next-test-utils'
import * as nodePath from 'node:path'

// This suite restarts the dev server before every test, which makes it one of
// the slowest files in CI. To keep shard times balanced, it's split into one
// `*.test.ts` entry file per (fixture, load mode, partial prefetching)
// combination, each calling this function. Keep the entry files in sync when
// adding a new dimension.
export function runDevWarmupTests({
  hasRuntimePrefetch,
  isInitialLoad,
}: {
  hasRuntimePrefetch: boolean
  isInitialLoad: boolean
}) {
  const partialPrefetching = !!process.env.__NEXT_PARTIAL_PREFETCHING

  const description = hasRuntimePrefetch
    ? 'with runtime prefetch configs'
    : 'without runtime prefetch configs'

  const fixturePath = hasRuntimePrefetch
    ? 'fixtures/with-prefetch-config'
    : 'fixtures/without-prefetch-config'

  describe(`cache-components-dev-warmup - ${description}`, () => {
    const { next } = nextTestSetup({
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
        `^(?=.*\\b${message}\\b)(?=.*\\b(Cache|Prerender|Prefetch|Server)\\b).*`
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

    describe(isInitialLoad ? 'initial load' : 'navigation', () => {
      // Static
      const STATIC_LINK_DATA = isInitialLoad
        ? 'Prerender'
        : // If we're rendering an App Shell, static params are deferred until the runtime stage.
          partialPrefetching || hasRuntimePrefetch
          ? 'Prefetch'
          : 'Prerender'
      const RUNTIME_LINK_DATA = 'Prefetch'

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
            assertLog(logs, 'after private cache read - page', 'Prefetch')
            assertLog(logs, 'after private cache read - layout', 'Prefetch')
            assertLog(
              logs,
              'after successive private cache reads - page',
              'Prefetch'
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
            assertLog(logs, 'after short-lived cache read - page', 'Prefetch')
            assertLog(logs, 'after short-lived cache read - layout', 'Prefetch')

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
          assertLog(logs, `after cookies`, 'Prefetch')
          assertLog(logs, `after headers`, 'Prefetch')
          // This route has no `generateStaticParams`, so its param stays
          // runtime-only.
          assertLog(logs, `after params`, 'Prefetch')
          assertLog(logs, `after searchParams`, 'Prefetch')

          assertLog(
            logs,
            `after prefetch`,
            // Same as navigation() below: static prerender timing on initial
            // load, app-shell timing for a client nav when there's a runtime
            // prefetch.
            isInitialLoad
              ? 'Prerender'
              : partialPrefetching || hasRuntimePrefetch
                ? 'Prefetch'
                : 'Prerender'
          )

          assertLog(
            logs,
            `after navigation`,
            // For initial load, navigation() follows static prerender timing.
            // For client nav, it follows app-shell timing if `partialPrefetching` is on,
            // and static timing otherwise.
            isInitialLoad
              ? 'Prerender'
              : partialPrefetching || hasRuntimePrefetch
                ? 'Prefetch'
                : 'Prerender'
          )

          assertLog(logs, 'after connection', 'Server')
        }

        if (isInitialLoad) {
          await testInitialLoad(path, assertLogs)
        } else {
          await testNavigation(path, assertLogs)
        }
      })

      describe('mixed static and fallback params resolve in the correct phase', () => {
        it('generated lang and novel id', async () => {
          const path = '/mixed/en/123'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()
            // The generators produce { lang: 'en', id: 'x' }. The optional
            // /mixed/en/[id] shell can complete the novel id statically.
            // `STATIC_LINK_DATA` accounts for App Shell deferral on navigation.
            assertLog(logs, 'after params - lang', STATIC_LINK_DATA)
            assertLog(logs, 'after params - id', STATIC_LINK_DATA)
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })

        it('novel lang and id', async () => {
          const path = '/mixed/fr/123'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()
            // Both params have generators. The optional /mixed/[lang]/[id]
            // shell can complete both novel values statically.
            assertLog(logs, 'after params - lang', STATIC_LINK_DATA)
            assertLog(logs, 'after params - id', STATIC_LINK_DATA)
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })

        it('fully generated params', async () => {
          const path = '/mixed/en/x'

          const assertLogs = async (browser: Playwright) => {
            const logs = await browser.log()
            // This URL matches the concrete generated route. Neither param
            // needs completion or fallback staging.
            assertLog(logs, 'after params - lang', STATIC_LINK_DATA)
            assertLog(logs, 'after params - id', STATIC_LINK_DATA)
          }

          if (isInitialLoad) {
            await testInitialLoad(path, assertLogs)
          } else {
            await testNavigation(path, assertLogs)
          }
        })

        // Only lang has a generator, so id stays runtime-only.
        // - en selects the required /partial/en/[id] shell.
        // - fr completes lang from the optional /partial/[lang]/[id] shell.
        it.each(['en', 'fr'])(
          'partial generation with lang %s',
          async (lang) => {
            const path = `/partial/${lang}/123`

            const assertLogs = async (browser: Playwright) => {
              const logs = await browser.log()
              assertLog(logs, 'after params - lang', STATIC_LINK_DATA)
              assertLog(logs, 'after cache read - layout', STATIC_LINK_DATA)
              assertLog(logs, 'after params - id', RUNTIME_LINK_DATA)
              assertLog(logs, 'after cache read - page', RUNTIME_LINK_DATA)
            }

            if (isInitialLoad) {
              await testInitialLoad(path, assertLogs)
            } else {
              await testNavigation(path, assertLogs)
            }
          }
        )
      })

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
          assertLog(logs, 'after cookies', 'Prefetch')
          if (hasRuntimePrefetch || partialPrefetching) {
            // in partialPrefetching (via per-segment config or global flag),
            // sync IO in the runtime stage errors and advances to Server.
            assertLog(logs, 'after sync io', 'Server')
            assertLog(logs, 'after cache read - page', 'Server')
          } else {
            // if runtime prefetching is not on, sync IO in the runtime stage
            // does nothing.
            assertLog(logs, 'after sync io', 'Prefetch')
            assertLog(logs, 'after cache read - page', 'Prefetch')
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
}
