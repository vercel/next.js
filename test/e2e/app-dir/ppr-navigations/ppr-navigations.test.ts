import { createNext } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'
import { createTestLog } from 'test-log'

describe('ppr-navigations', () => {
  if ((global as any).isNextDev) {
    test('prefetching is disabled in dev', () => {})
    return
  }

  let server
  let next
  afterEach(async () => {
    await next?.destroy()
    server?.close()
  })

  test('when PPR is enabled, loading.tsx boundaries do not cause a partial prefetch', async () => {
    const TestLog = createTestLog()
    let pendingRequests = new Map()
    server = createTestDataServer(async (key, res) => {
      TestLog.log('REQUEST: ' + key)
      if (pendingRequests.has(key)) {
        throw new Error('Request already pending for ' + key)
      }
      pendingRequests.set(key, res)
    })
    const port = await findPort()
    server.listen(port)
    next = await createNext({
      files: __dirname + '/loading-tsx-no-partial-rendering',
      env: { TEST_DATA_SERVICE_URL: `http://localhost:${port}` },
    })

    // There should have been no data requests during build
    TestLog.assert([])

    const browser = await next.browser('/start')

    // Use a text input to set the target URL.
    const input = await browser.elementByCss('input')
    await input.fill('/yay')

    // This causes a <Link> to appear. (We create the Link after initial render
    // so we can control when the prefetch happens.)
    const link = await browser.elementByCss('a')
    expect(await link.getAttribute('href')).toBe('/yay')

    // The <Link> triggers a prefetch. Even though this route has a loading.tsx
    // boundary, we're still able to prefetch the static data in the page.
    // Without PPR, we would have stopped prefetching at the loading.tsx
    // boundary. (The dynamic data is not fetched until navigation.)
    await TestLog.waitFor(['REQUEST: yay [static]'])

    // Navigate. This will trigger the dynamic fetch.
    await link.click()

    // TODO: Even though the prefetch request hasn't resolved yet, we should
    // have already started fetching the dynamic data. Currently, the dynamic
    // is fetched lazily during rendering, creating a waterfall. The plan is to
    // remove this waterfall by initiating the fetch directly inside the
    // router navigation handler, not during render.
    TestLog.assert([])

    // Finish loading the static data
    pendingRequests.get('yay [static]').resolve()

    // The static UI appears
    await browser.elementById('static')
    const container = await browser.elementById('container')
    expect(await container.innerHTML()).toEqual(
      'Loading dynamic...<div id="static">yay [static]</div>'
    )

    // The dynamic data is fetched
    TestLog.assert(['REQUEST: yay [dynamic]'])

    // Finish loading and render the full UI
    pendingRequests.get('yay [dynamic]').resolve()
    await browser.elementById('dynamic')
    expect(await container.innerHTML()).toEqual(
      '<div id="dynamic">yay [dynamic]</div><div id="static">yay [static]</div>'
    )

    // Now we'll demonstrate that even though loading.tsx wasn't activated
    // during initial render, it still acts as a regular Suspense boundary.
    // Trigger a "bad" Suspense fallback by intentionally suspending without
    // startTransition.
    await browser.elementById('trigger-bad-suspense-fallback').click()
    const loading = await browser.elementById('loading-tsx')
    expect(await loading.innerHTML()).toEqual('Loading [inner loading.tsx]...')
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
        files: __dirname + '/stale-prefetch-entry',
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

  test(
    'updates page data during a nav even if no shared layouts have changed ' +
      '(e.g. updating a search param on the current page)',
    async () => {
      next = await createNext({
        files: __dirname + '/search-params',
      })
      const browser = await next.browser('/')

      // Click a link that updates the current page's search params.
      const link = await browser.elementByCss('a')
      await link.click()

      // Confirm that the page re-rendered with the new search params.
      const searchParamsContainer = await browser.elementById('search-params')
      expect(await searchParamsContainer.innerText()).toBe(
        'Search params: {"blazing":"good"}'
      )
    }
  )
})
