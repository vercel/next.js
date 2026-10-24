import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
import type * as Playwright from 'playwright'

// When the root starts hydrating before the client chunk of a component in the
// page has loaded, the hydration render suspends on the RSC payload of the
// segment. React should wait until the chunk arrives. Previously, `Head` and
// `InnerLayoutRouter` called `useDeferredValue(rsc, rsc)` when there was no
// prefetched value. Every suspended hydration attempt then spawned a deferred
// render whose empty commit retried hydration right away, so the root was
// re-rendered in a loop until the chunk arrived
// (https://github.com/react/react/issues/37682).
describe('hydration while a client chunk is pending', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('waits for the chunk without restarting hydration', async () => {
    let page: Playwright.Page
    let releaseChunk: () => void
    const chunkReleased = new Promise<void>((resolve) => {
      releaseChunk = resolve
    })
    let isChunkHeld = false

    const browser = await next.browser('/', {
      waitUntil: 'commit',
      waitHydration: false,
      async beforePageLoad(p: Playwright.Page) {
        page = p
        // React calls the DevTools hook on every commit, in production builds
        // too. A commit while the root is still dehydrated hydrated nothing.
        await p.addInitScript(() => {
          const stats = { commitsBeforeHydration: 0, hydrated: false }
          ;(window as any).__hydrationStats = stats
          ;(window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
            supportsFiber: true,
            inject: () => 1,
            onCommitFiberRoot(_id: number, root: any) {
              if (root.current.memoizedState?.isDehydrated) {
                stats.commitsBeforeHydration++
              } else {
                stats.hydrated = true
              }
            },
            onPostCommitFiberRoot() {},
            onCommitFiberUnmount() {},
            setStrictMode() {},
            checkDCE() {},
          }
        })
        await p.route('**/_next/static/**', async (route) => {
          const response = await route.fetch()
          const body = await response.body()
          if (body.includes('DELAYED_CLIENT_COMPONENT')) {
            isChunkHeld = true
            await chunkReleased
          }
          await route.fulfill({ response, body })
        })
      },
    })

    // Hydration has started and is suspended on the held chunk.
    await retry(async () => {
      expect(isChunkHeld).toBe(true)
      expect(
        await page.evaluate(() => (window as any).__hydrationAttempts)
      ).toBeGreaterThan(0)
    })
    await waitFor(1000)

    const stats = await page.evaluate(() => (window as any).__hydrationStats)
    expect(stats.hydrated).toBe(false)
    expect(stats.commitsBeforeHydration).toBe(0)
    expect(
      await page.evaluate(() => (window as any).__hydrationAttempts)
    ).toBeLessThan(5)

    releaseChunk()
    await retry(async () => {
      expect(
        await page.evaluate(() => (window as any).__hydrationStats.hydrated)
      ).toBe(true)
    })
    await browser.elementById('increment').click()
    await retry(async () => {
      expect(await browser.elementById('increment').text()).toBe('Count: 1')
    })
  })
})
