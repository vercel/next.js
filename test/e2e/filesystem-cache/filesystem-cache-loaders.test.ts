/* eslint-disable jest/no-standalone-expect */
import { isNextDev } from 'e2e-utils'
import { existsSync } from 'fs'
import path from 'path'
import { parseTraceEvents } from '../../lib/parse-trace-file'
import { setupFilesystemCacheTest } from './filesystem-cache-helpers'

for (const cacheEnabled of [false, true]) {
  // TODO(deploy-test-completion): Re-enable this suite in deploy mode.
  // It likely mutates files in the isolated local fixture after setup.
  // @force-gate !deploy
  describe(`filesystem-caching with cache ${cacheEnabled ? 'enabled' : 'disabled'}`, () => {
    const { next, stop, restartCycle } = setupFilesystemCacheTest(cacheEnabled)

    // Very flakey with Webpack enabled
    ;(process.env.IS_TURBOPACK_TEST ? it : it.skip)(
      'should cache or not cache loaders',
      async () => {
        let appTimestamp, unchangedTimestamp, appClientTimestamp, pagesTimestamp
        {
          const browser = await next.browser('/')
          appTimestamp = await browser.elementByCss('main').text()
          expect(appTimestamp).toMatch(/Timestamp = \d+$/)
          await browser.close()
        }
        {
          const browser = await next.browser('/unchanged')
          unchangedTimestamp = await browser.elementByCss('main').text()
          expect(unchangedTimestamp).toMatch(/Timestamp = \d+$/)
          await browser.close()
        }
        {
          const browser = await next.browser('/client')
          appClientTimestamp = await browser.elementByCss('main').text()
          expect(appClientTimestamp).toMatch(/Timestamp = \d+$/)
          await browser.close()
        }
        {
          const browser = await next.browser('/pages')
          pagesTimestamp = await browser.elementByCss('main').text()
          expect(pagesTimestamp).toMatch(/Timestamp = \d+$/)
          await browser.close()
        }
        const initialCacheSize = await restartCycle()

        {
          const browser = await next.browser('/')
          const newTimestamp = await browser.elementByCss('main').text()
          expect(newTimestamp).toMatch(/Timestamp = \d+$/)
          if (cacheEnabled) {
            expect(newTimestamp).toBe(appTimestamp)
          } else {
            expect(newTimestamp).not.toBe(appTimestamp)
          }
          await browser.close()
        }
        {
          const browser = await next.browser('/unchanged')
          const newTimestamp = await browser.elementByCss('main').text()
          expect(newTimestamp).toMatch(/Timestamp = \d+$/)
          if (cacheEnabled) {
            expect(newTimestamp).toBe(unchangedTimestamp)
          } else {
            expect(newTimestamp).not.toBe(unchangedTimestamp)
          }
          await browser.close()
        }
        {
          const browser = await next.browser('/client')
          const newTimestamp = await browser.elementByCss('main').text()
          expect(newTimestamp).toMatch(/Timestamp = \d+$/)
          if (cacheEnabled) {
            expect(newTimestamp).toBe(appClientTimestamp)
          } else {
            expect(newTimestamp).not.toBe(appClientTimestamp)
          }
          await browser.close()
        }
        {
          const browser = await next.browser('/pages')
          const newTimestamp = await browser.elementByCss('main').text()
          expect(newTimestamp).toMatch(/Timestamp = \d+$/)
          if (cacheEnabled) {
            expect(newTimestamp).toBe(pagesTimestamp)
          } else {
            expect(newTimestamp).not.toBe(pagesTimestamp)
          }
          await browser.close()
        }

        if (cacheEnabled) {
          const finalCacheSize = await restartCycle()
          const increasePercent = (
            (finalCacheSize / initialCacheSize - 1) *
            100
          ).toFixed(2)
          console.log(
            `Cache size: ${(initialCacheSize / 1024 / 1024).toFixed(2)} MB -> ${(finalCacheSize / 1024 / 1024).toFixed(2)} MB (${increasePercent}%)`
          )
          expect(finalCacheSize).toBeLessThanOrEqual(initialCacheSize * 1.1)
        }
      }
    )

    if (cacheEnabled) {
      ;(process.env.IS_TURBOPACK_TEST ? it : it.skip)(
        'should emit turbopack-persistence trace spans',
        async () => {
          // Trigger a page load so persistence has data to write
          const browser = await next.browser('/')
          expect(await browser.elementByCss('main').text()).toMatch(
            /Timestamp = \d+$/
          )
          await browser.close()

          // Wait for persistence to write to disk
          await stop()

          const traceDir = isNextDev ? '.next/dev' : '.next'
          const tracePath = path.join(next.testDir, traceDir, 'trace')
          expect(existsSync(tracePath)).toBe(true)

          const events = parseTraceEvents(tracePath)
          const persistenceEvents = events.filter(
            (e) => e.name === 'turbopack-persistence'
          )

          expect(persistenceEvents.length).toBeGreaterThan(0)

          // Verify the persistence event has the expected attributes
          const event = persistenceEvents[0]
          expect(event.duration).toBeGreaterThanOrEqual(0)
          expect(event.tags).toBeDefined()
          const tags = event.tags as Record<string, unknown>
          expect(tags.reason).toBeDefined()
          expect(typeof tags.snapshot_duration_ms).toBe('number')
          expect(typeof tags.persist_duration_ms).toBe('number')
          expect(typeof tags.task_count).toBe('number')
        }
      )
    }
  })
}
