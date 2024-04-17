import { createNext } from 'e2e-utils'
import { findPort } from 'next-test-utils'
import { createTestDataServer } from 'test-data-service/writer'
import { createTestLog } from 'test-log'

describe('loading-tsx-no-partial-rendering', () => {
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
      files: __dirname,
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
})
