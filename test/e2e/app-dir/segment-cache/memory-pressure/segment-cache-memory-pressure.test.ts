import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import type { CDPSession, Page, Request as PlaywrightRequest } from 'playwright'

describe('segment cache memory pressure', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })
  if (isNextDev) {
    test('disabled in development', () => {})
    return
  }

  it('evicts least recently used prefetch data once cache size exceeds limit', async () => {
    let act: ReturnType<typeof createRouterAct>
    const browser = await next.browser('/memory-pressure', {
      beforePageLoad(page) {
        act = createRouterAct(page)
      },
    })

    const switchToTab1 = await browser.elementByCss(
      'input[type="radio"][value="1"]'
    )
    const switchToTab2 = await browser.elementByCss(
      'input[type="radio"][value="2"]'
    )

    // Switch to tab 1 to kick off a prefetch for a link to Page 0.
    await act(
      async () => {
        await switchToTab1.click()
      },
      { includes: 'Page 0.' }
    )

    // Switching to tab 2 causes the cache to overflow, evicting the prefetch
    // for the Page 0 link.
    await act(
      async () => {
        await switchToTab2.click()
      },
      { includes: 'Page 1.' }
    )

    // Switching back to tab 1 initiates a new prefetch for Page 0. If
    // there are no requests, that means the prefetch was not evicted correctly.
    await act(
      async () => {
        await switchToTab1.click()
      },
      {
        includes: 'Page 0.',
      }
    )

    // Switching back to tab 2 should not evict and re-fetch the prefetches for
    // Page 0 and Page 1, since they were recently accessed.
    await act(async () => {
      await switchToTab2.click()
    }, [
      { includes: 'Page 0.', block: 'reject' },
      { includes: 'Page 1.', block: 'reject' },
    ])
  })

  it('does not leak memory when repeatedly triggering prefetches', async () => {
    let cdpSession: CDPSession
    let page: Page
    const browser = await next.browser('/memory-pressure', {
      async beforePageLoad(p: Page) {
        page = p
        cdpSession = await page.context().newCDPSession(page)
        await cdpSession.send('HeapProfiler.enable')
      },
    })

    const tab0Radio = await browser.elementByCss(
      'input[type="radio"][value="0"]'
    )
    const tab2Radio = await browser.elementByCss(
      'input[type="radio"][value="2"]'
    )

    const totalCycles = 10
    const measurements: number[] = []

    for (let i = 0; i < totalCycles; i++) {
      // Switch to Tab 2 (links mount, prefetches are triggered)
      const prefetchesSettled = waitForPrefetchesToSettle(page)
      await tab2Radio.click()
      await browser.waitForElementByCss('#tab-content a')
      await prefetchesSettled

      // Switch back to Tab 0 (links unmount)
      await tab0Radio.click()
      await browser.waitForElementByCss('#tab-0-content')

      measurements.push(await getHeapMB(cdpSession))
    }

    // Use linear regression on measurements (skipping the first as warmup)
    // to compute the slope (MB/cycle). If evicted prefetch entries are not
    // properly garbage-collected, the heap will grow steadily across cycles
    // instead of plateauing.
    const afterWarmup = measurements.slice(1)
    const n = afterWarmup.length
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumXX = 0
    for (let j = 0; j < n; j++) {
      sumX += j
      sumY += afterWarmup[j]
      sumXY += j * afterWarmup[j]
      sumXX += j * j
    }
    const growthPerCycle = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)

    try {
      expect(growthPerCycle).toBeLessThan(0.1)
    } catch (e) {
      throw new Error(
        `Heap grew ${growthPerCycle.toFixed(3)} MB/cycle.\n` +
          `Measurements (MB): ${measurements.map((m) => m.toFixed(2)).join(', ')}`
      )
    }
  }, 120_000)
})

async function getHeapMB(cdpSession: CDPSession): Promise<number> {
  await cdpSession.send('HeapProfiler.collectGarbage')
  await cdpSession.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdpSession.send('Runtime.getHeapUsage')
  return usedSize / 1024 / 1024
}

/**
 * Returns a promise that resolves once all in-flight prefetch requests have
 * received responses and no new ones have been initiated for `quietMs`. Must be
 * called *before* the action that triggers prefetches so that no requests are
 * missed.
 */
function waitForPrefetchesToSettle(page: Page, quietMs = 200): Promise<void> {
  let inFlight = 0
  let resolve: () => void
  let timer: ReturnType<typeof setTimeout> | null = null
  const promise = new Promise<void>((r) => {
    resolve = r
  })

  function done() {
    page.off('request', onRequest)
    page.off('requestfinished', onRequestDone)
    page.off('requestfailed', onRequestDone)
    resolve()
  }

  function check() {
    if (inFlight === 0) {
      if (timer) {
        clearTimeout(timer)
      }
      timer = setTimeout(done, quietMs)
    }
  }

  function onRequest(req: PlaywrightRequest) {
    if (req.headers()['next-router-segment-prefetch']) {
      inFlight++
      if (timer) {
        clearTimeout(timer)
      }
    }
  }

  function onRequestDone(req: PlaywrightRequest) {
    if (req.headers()['next-router-segment-prefetch']) {
      inFlight--
      check()
    }
  }

  page.on('request', onRequest)
  page.on('requestfinished', onRequestDone)
  page.on('requestfailed', onRequestDone)

  return promise
}
