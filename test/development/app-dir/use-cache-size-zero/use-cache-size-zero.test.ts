import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor, waitForNoErrorToast } from 'next-test-utils'

describe('use-cache-size-zero', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Expose completed default-handler writes so the test can synchronize with
    // background revalidation without relying on an elapsed-time delay.
    env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
  })

  if (skipped) {
    return
  }

  it('serves the stale cached value on a warm reload, then converges to a fresh one', async () => {
    const browser = await next.browser('/reload', {
      waitHydration: false,
      // Do not wait for "load"; inspect the page as it streams in.
      waitUntil: 'commit',
    })

    // Cold load: the cache misses, so the loading boundary (the only `p` at
    // this point) streams first, and the generated value streams in once the
    // ~1s generation completes. Read at commit (`waitUntil: false`) so we don't
    // wait for "load", which only fires once the value has streamed in.
    expect(await browser.elementByCss('p', { waitUntil: false }).text()).toBe(
      'Loading...'
    )
    const coldValue = await browser
      .elementByCss('#value', { waitUntil: false })
      .text()
    expect(coldValue).toBeDateString()

    const completedReloadCacheWrites = () =>
      next.cliOutput.match(
        /DefaultCacheHandler: set \["[A-Za-z0-9_-]+","[0-9a-f]+",\["reload"\],"[^"]+"\] done/g
      )?.length ?? 0

    // The value can finish streaming before the cache handler has persisted
    // it. Wait for that write before testing the first warm reload.
    await retry(() => {
      expect(completedReloadCacheWrites()).toBeGreaterThan(0)
    }, 10000)
    const cacheWritesBeforeWarmReload = completedReloadCacheWrites()

    // Warm reload: `cacheMaxMemorySize: 0` still caches in development, so the
    // reload serves the previously cached value fast instead of regenerating
    // it. The entry keeps its default (non-dynamic) cache life, so it's served
    // straight from the cache rather than treated as a dynamic hole. A
    // background revalidation regenerates a fresh entry for the next reload
    // (asserted below).
    await browser.refresh({ waitUntil: 'commit' })
    expect(
      await browser.elementByCss('#value', { waitUntil: false }).text()
    ).toBe(coldValue)

    // That warm reload regenerates a fresh entry in the background. The warm
    // response can finish before that write, so wait for the handler to commit
    // another value before checking the next reload.
    await retry(() => {
      expect(completedReloadCacheWrites()).toBeGreaterThan(
        cacheWritesBeforeWarmReload
      )
    }, 10000)

    await browser.refresh()
    expect(await browser.elementById('value').text()).not.toBe(coldValue)
  })

  it('shows the Cold cache badge on an initial cold load and not on a warm reload', async () => {
    const browser = await next.browser('/cold-badge')

    // Cold load: the cache misses and fills while streaming, so the cold
    // verdict is reported and (once the dev overlay's socket connects) the
    // badge appears.
    await browser.elementById('value')
    await retry(async () => {
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        true
      )
    })
    expect(
      await browser
        .elementByCss('[data-cold-cache-badge] [data-issues-open]')
        .text()
    ).toBe('Cold cache')

    // Warm reload: the dev cache serves the entry without a miss, so no cold
    // verdict is reported. An absence can't be retried on, so wait out the
    // window in which a replayed push would arrive, then assert it never did.
    await browser.refresh()
    await browser.elementById('value')
    await waitFor(500)
    expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(false)
  })

  it('does not surface a blocking-route error on a warm reload of a fully cached route', async () => {
    const browser = await next.browser('/')

    // Cold load: the page-level `'use cache'` misses and fills in the
    // background while the result streams in immediately.
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('Hello, world!')
    })

    // Warm reload (the second request): the dev cache serves the cached value.
    // The route has no dynamic data, so serving it from cache must not surface
    // a false-positive blocking-route red box.
    await browser.refresh()
    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('Hello, world!')
    })
    await waitForNoErrorToast(browser)
  })
})
