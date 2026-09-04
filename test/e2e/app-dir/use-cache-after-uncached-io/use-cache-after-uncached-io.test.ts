import { nextTestSetup } from 'e2e-utils'
import * as Playwright from 'playwright'
import { createRouterAct } from '../../../lib/router-act'
import { setTimeout } from 'timers/promises'
import { retry } from '../../../lib/next-test-utils'

// Deploy mode exclusion: This suite asserts local CLI or runtime logs that deployments do not expose.
// reads cli logs
// @force-gate !deploy
describe('use cache called after tasky uncached IO', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('does not store an incomplete cache entry in the cache handler', async () => {
      // This is a regression test against for a bug:
      // https://github.com/vercel/next.js/issues/96339
      // If a cache read was initiated after the prerender was aborted (due to tasky IO),
      // we'd try filling the cache, immediately abort the fill (because it was tied to
      // renderSignal, which was already aborted), and then save the empty cache entry,
      // effectively poisoning future reads of that cache.

      // Revalidate /uses-cache (and, just to be safe, the cache that it references)
      // so that we have a fresh prerender we can assert on
      await next.fetch('/revalidate-uses-cache', { method: 'POST' })

      let page: Playwright.Page
      const browser = await next.browser('/', {
        beforePageLoad(p) {
          page = p
        },
      })
      const act = createRouterAct(page)

      // Prefetch the page, triggering a fresh prerender
      await act(async () => {
        await browser
          .elementByCss('input[data-link-accordion="/uses-cache"]')
          .click()
      }, [
        {
          // Sanity check: the prefetch should not include the cache
          includes: 'cached-data',
          block: 'reject',
        },
      ])

      // Wait for the call to the "use cache" function to finish.
      // Before the bugfix, reading the cache would result in an incorrect value
      // being stored in the cache handler, so we need to make sure the cache
      // is finished before we proceed.
      await retry(
        () => {
          expect(next.cliOutput).toContain('after-cache-read')
        },
        5000,
        200
      )
      await setTimeout(500)

      // Navigate to the page. The response should include the cache
      await act(
        async () => {
          await browser.elementByCss('a[href="/uses-cache"]').click()
        },

        { includes: 'cached-data' }
      )

      // The bug manifested as the cache read throwing "Error: Connection closed."
      // If we can observe the cache's value, then everything is ok.
      expect(await browser.elementByCss('#data').text()).toMatch(
        /cached-data: \d+/
      )
    })
  } else {
    it('resolves in dev', async () => {
      // There's no prefetching in dev, so the best we can do is
      // test that the cache resolves as expected.
      const browser = await next.browser('/uses-cache')
      expect(await browser.elementByCss('#data').text()).toMatch(
        /cached-data: \d+/
      )
    })
  }
})
