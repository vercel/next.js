import { createNext } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'
import { createTestLog } from 'test-log'

describe('stale-prefetch-entry', () => {
  if ((global as any).isNextDev) {
    test('ppr is disabled in dev', () => {})
    return
  }

  let server
  let next
  afterEach(async () => {
    await next?.destroy()
    server?.close()
  })

  // This is a regression test where a condition that checked whether a cached
  // route entry was stale accidentally caused the router to treat prefetched
  // data as if it were complete data that didn't contain dynamic holes. This
  // prevented the dynamic data from ever streaming in.
  test(
    'works if a prefetched route entry has become stale (too much ' +
      'time has elapsed since it was prefetched)',
    async () => {
      const TestLog = createTestLog()
      let autoresolveRequests = true
      let pendingRequests = new Map()
      server = createTestDataServer(async (key, res) => {
        TestLog.log('REQUEST: ' + key)
        if (autoresolveRequests) {
          res.resolve()
          return
        }
        if (pendingRequests.has(key)) {
          throw new Error('Request already pending for ' + key)
        }
        pendingRequests.set(key, res)
      })
      const port = await findPort()
      server.listen(port)
      next = await createNext({
        files: __dirname,
        env: { TEST_DATA_SERVICE_URL: `http://localhost:${port}` },
      })
      TestLog.assert(['REQUEST: Some data [static]'])
      autoresolveRequests = false

      const browser = await next.browser('/', {
        // Override Date.now so we can simulate time passing to expire a
        // prefetch entry.
        async beforePageLoad(page) {
          await page.addInitScript(`
            __FAKE_NOW__ = 0
            Date = class extends Date {
              constructor(...args) {
                if (args.length === 0) {
                  super(__FAKE_NOW__)
                } else {
                  super(...args)
                }
              }
              static now() {
                return __FAKE_NOW__
              }
            }
          `)
        },
      })

      const startTime = await browser.eval(() => Date.now())

      // Explicitly hover over the link to trigger a prefetch.
      const link = await browser.elementByCss('a[href="/some-page"]')
      await link.hover()

      // Increment time by 3 minutes. This is longer than the default expiration
      // interval for prefetch entries.
      await browser.eval(`__FAKE_NOW__ = 60 * 1000 * 3`)
      const endTime = await browser.eval(() => Date.now())
      // Sanity check.
      expect(endTime - startTime).toBe(60 * 1000 * 3)

      // Navigate. The prefetch entry will be stale.
      await link.click()

      // The static UI appears immediately because it was prerendered at
      // build time.
      const staticContainer = await browser.elementById('static')
      expect(await staticContainer.innerText()).toBe('Some data [static]')

      // The dynamic data is fetched on navigation. (In the regression case that
      // this test simulates, the dynamic data was never requested, and the page
      // got stuck in a loading state.)
      await TestLog.waitFor(['REQUEST: Some data [dynamic]'])
      pendingRequests.get('Some data [dynamic]').resolve()

      // Now the dynamic data appears.
      const dynamicContainer = await browser.elementById('dynamic')
      expect(await dynamicContainer.innerText()).toBe('Some data [dynamic]')
    }
  )
})
