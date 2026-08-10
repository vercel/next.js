import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor, waitForNoErrorToast } from 'next-test-utils'

describe('use-cache-size-zero', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
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
    await retry(async () => {
      expect(
        await browser.elementByCss('p', { waitUntil: false }).text()
      ).toBeDateString()
    })
    const coldValue = await browser
      .elementByCss('p', { waitUntil: false })
      .text()

    // Warm reload: `cacheMaxMemorySize: 0` still caches in development, so the
    // reload serves the previously cached value fast instead of regenerating
    // it. The entry keeps its default (non-dynamic) cache life, so it's served
    // straight from the cache rather than treated as a dynamic hole. A
    // background revalidation regenerates a fresh entry for the next reload
    // (asserted below).
    await browser.refresh({ waitUntil: 'commit' })
    await retry(async () => {
      expect(
        await browser.elementByCss('p', { waitUntil: false }).text()
      ).toBeDateString()
    })
    expect(await browser.elementByCss('p', { waitUntil: false }).text()).toBe(
      coldValue
    )

    // That warm reload regenerated a fresh entry in the background, so a later
    // reload converges to the new value. Read after "load" here (a plain
    // refresh) since we want the settled value, not the streaming inspection
    // above.
    await retry(async () => {
      await browser.refresh()
      expect(await browser.elementById('value').text()).not.toBe(coldValue)
    })
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
