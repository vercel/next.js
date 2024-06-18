import { createNext } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'
import { createTestLog } from 'test-log'

describe('avoid-popstate-flash', () => {
  if ((global as any).isNextDev || (global as any).isNextDeploy) {
    // this is skipped in dev because PPR is not enabled in dev
    // and in deploy we can't rely on this test data service existing
    test('should skip dev & deploy', () => {})
    return
  }

  let server
  let next
  afterEach(async () => {
    await next?.destroy()
    server?.close()
  })

  test('does not flash back to partial PPR data during back/forward navigation', async () => {
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
    TestLog.assert(['REQUEST: Static'])
    autoresolveRequests = false

    const browser = await next.browser('/')

    // Navigate to the target page.
    const link = await browser.elementByCss('a[href="/some-page"]')
    await link.click()

    // The static UI appears immediately because it was prerendered at
    // build time.
    const staticContainer = await browser.elementById('static')
    expect(await staticContainer.innerText()).toBe('Static')

    await TestLog.waitFor(['REQUEST: Dynamic'])
    pendingRequests.get('Dynamic').resolve()

    // Now the dynamic data appears.
    const dynamic = await browser.elementById('dynamic')
    expect(await dynamic.innerText()).toBe('Dynamic')

    // At this point all the data has been loaded into the cache. We're going
    // to test what happens during a back/forward navigation.

    // Set a global state that causes Suspense fallbacks to throw.
    const checkbox = await browser.elementById('should-fallback-throw')
    await checkbox.click()
    const checked = await checkbox.getProperty('checked')
    expect(await checked.jsonValue()).toBe(true)

    // Navigate using back/forward using the browser's history stack. This
    // should not trigger a fresh navigation, nor any network requests. We
    // should read the data from the cache. And we should not render the
    // partially complete PPR data that was used during the initial navigation.
    //
    // If the data is not read from cache, or if partial data is shown, it will
    // trigger a fallback, which will throw an error because of the state we
    // set above.
    await browser.back()
    await browser.forward()

    // Confirm that the dynamic data is visible. This implies that the fallback
    // did not throw.
    const dynamic2 = await browser.elementById('dynamic')
    expect(await dynamic2.innerText()).toBe('Dynamic')

    // There should have been no additional requests.
    TestLog.assert([])
  })
})
