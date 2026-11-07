import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('optional-catchall-index-prefetch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Regression test: a full prefetch of the index of an optional catch-all
  // (e.g. `/` for `app/[[...slug]]`) only renders from the page segment down,
  // because the client already has the catch-all segment. The page reads
  // `params.slug`, so its cache entry must vary on `slug`. Otherwise the client
  // reuses the index page for sibling URLs like `/b`.
  it('does not reuse the prefetched index page for sibling URLs', async () => {
    const browser = await next.browser('/a')

    // Wait for the prefetch of the index link to land.
    await browser.waitForIdleNetwork()

    await browser.elementByCss('#link-b').click()

    await retry(async () => {
      expect(await browser.url()).toBe(next.url + '/b')
      // Inactive routes may stay mounted but hidden, so read the visible
      // heading.
      const title = await browser.eval(
        () =>
          [...document.querySelectorAll('main h1')].find(
            (h) => h.getClientRects().length > 0
          )?.textContent
      )
      expect(title).toBe('Page /b')
    })
  })
})
