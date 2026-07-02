import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('use-cache-custom-handler-dev', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('shows the Cold cache badge on a cold load but not on a warm reload through a slow custom handler', async () => {
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

    // Warm reload: the built-in front serves the entry in a microtask, so the
    // read isn't pending at a staged render boundary and no cold verdict is
    // reported - even though the custom handler's own `get` is slow. Without
    // the front, that slow `get` would make this a phantom cold miss. An
    // absence can't be retried on, so wait out the replay window, then assert
    // it never appeared.
    await browser.refresh()
    await browser.elementById('value')
    await waitFor(500)
    expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(false)
  })

  it('serves a short-expire value warm through a custom handler and re-warms it on each reload', async () => {
    const browser = await next.browser('/expire-zero', {
      waitHydration: false,
      // Do not wait for "load"; inspect the page as it streams in.
      waitUntil: 'commit',
    })

    // Cold load: the custom handler misses, the value generates and is written
    // through to both the backing handler and the dev-only in-memory front. We
    // wait for the streamed-in element without waiting for "load".
    const coldValue = await browser
      .elementByCss('#value', { waitUntil: false })
      .text()
    expect(coldValue).toBeDateString()

    // Warm reload: served fast from the front, whose minimum retention keeps
    // the short-`expire` entry. The custom handler's slow `get` isn't on the
    // critical path, and the short `expire` no longer evicts the front entry on
    // every read, so the same cached value shows.
    await browser.refresh({ waitUntil: 'commit' })
    expect(
      await browser.elementByCss('#value', { waitUntil: false }).text()
    ).toBe(coldValue)

    // Each warm reload re-executes the cache function and writes through to the
    // backing, so reloads converge to a fresh value.
    await retry(async () => {
      await browser.refresh()
      expect(await browser.elementById('value').text()).not.toBe(coldValue)
    })
  })

  it('stops serving a front-cached entry after the backing cache is purged out-of-band', async () => {
    const browser = await next.browser('/purged')

    // Cold load: the custom handler misses, the value generates and is written
    // through to both the backing handler and the dev-only in-memory front.
    const coldValue = await browser.elementById('value').text()

    // Warm reload: served from the front. Its real cache life keeps it
    // shell-eligible, so the same cached value shows immediately.
    await browser.refresh()
    expect(await browser.elementById('value').text()).toBe(coldValue)

    // Purge the backing handler out-of-band. The front still holds the entry,
    // so it would keep serving the stale value indefinitely if the tiered
    // handler didn't evict it.
    await next.fetch('/purge')

    // The reconcile can only evict the front entry once it has observed the
    // backing miss, which happens one read after the purge. So reloads converge
    // on a freshly generated value instead of serving the purged front copy
    // forever.
    await retry(async () => {
      await browser.refresh()
      expect(await browser.elementById('value').text()).not.toBe(coldValue)
    })
  })
})
