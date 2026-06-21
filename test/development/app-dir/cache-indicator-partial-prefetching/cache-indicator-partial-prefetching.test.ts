import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

// Partial prefetching is enabled here (and Cache Components), so a client
// navigation to a route with `export const prefetch = 'allow-runtime'` reveals
// the runtime shell. Caches that resolve in the runtime stage (a `'use cache'`
// read after `await params`, or a private cache) are therefore part of the
// shell for that navigation, so a cold cache must show the Cold cache badge,
// unlike on an initial (static-shell) load, where those same caches sit after
// the shell. (The static-shell behavior is covered in the `cache-indicator`
// suite.)
describe('cache-indicator-partial-prefetching', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('shows the Cold cache badge on a cold runtime-prefetch navigation to a route whose cache read follows await params, not on a warm one', async () => {
    const browser = await next.browser('/')

    // Cold navigation: the cache read sits after `await params`, so it resolves
    // in the runtime stage, part of the runtime shell for this navigation, so a
    // cold cache there shows the badge.
    await browser.elementByCss('a[href="/params/some-id"]').click()
    await browser.elementById('params')
    await retry(async () => {
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        true
      )
    })

    // Navigate to the static home (a fresh render clears the badge), then wait
    // for the background fill to settle so the next navigation is a warm hit.
    await browser.elementByCss('a[href="/"]').click()
    await retry(async () => {
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        false
      )
    })
    await waitFor(2000)

    // Warm navigation: the runtime shell is a cache hit, so no badge. An absence
    // can't be retried on, so wait out the replay window, then assert it never
    // appeared.
    await browser.elementByCss('a[href="/params/some-id"]').click()
    await browser.elementById('params')
    await waitFor(500)
    expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(false)
  })

  it('shows the Cold cache badge on a cold runtime-prefetch navigation to a private-cache route, not on a warm one', async () => {
    const browser = await next.browser('/')

    // Cold navigation: the private cache resolves in the runtime shell, so a
    // cold cache there shows the badge.
    await browser.elementByCss('a[href="/private"]').click()
    await browser.elementById('private')
    await retry(async () => {
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        true
      )
    })

    // Navigate to the static home (a fresh render clears the badge), then wait
    // for the background fill to settle.
    await browser.elementByCss('a[href="/"]').click()
    await retry(async () => {
      expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(
        false
      )
    })
    await waitFor(2000)

    // Warm navigation: the private entry is served from the dev store, so no
    // badge.
    await browser.elementByCss('a[href="/private"]').click()
    await browser.elementById('private')
    await waitFor(500)
    expect(await browser.hasElementByCss('[data-cold-cache-badge]')).toBe(false)
  })
})
