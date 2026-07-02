import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-default-handler-expire-zero', () => {
  const { next, skipped, isNextStart } = nextTestSetup({
    files: __dirname,
    // Enable the built-in default cache handler's debug logging so we can
    // assert on its `set()` decisions in the CLI output. That output is not
    // available on deploy, so skip the deploy variant.
    env: { NEXT_PRIVATE_DEBUG_CACHE: '1' },
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextStart) {
    it('does not save an expire:0 cache to the built-in default handler, but saves a short-lived one', async () => {
      const browser = await next.browser('/')
      expect(
        await browser.elementById('expire-zero-value').text()
      ).toBeDateString()
      expect(
        await browser.elementById('short-lived-value').text()
      ).toBeDateString()

      // The default handler skips storing the `expire: 0` entry (it would never
      // be served back in production)...
      expect(next.cliOutput).toMatch(
        /DefaultCacheHandler: set \["[A-Za-z0-9_-]+","([0-9a-f]{2})+",\[{"id":"expire-zero"}]\] skipped dynamic entry/
      )

      // ...and never reports it as stored.
      expect(next.cliOutput).not.toMatch(
        /DefaultCacheHandler: set \["[A-Za-z0-9_-]+","([0-9a-f]{2})+",\[{"id":"expire-zero"}]\] done/
      )

      // The short-lived (`expire: 60`) cache is still stored.
      expect(next.cliOutput).toMatch(
        /DefaultCacheHandler: set \["[A-Za-z0-9_-]+","([0-9a-f]{2})+",\[{"id":"short-lived"}]\] done/
      )
    })
  } else {
    it('saves an expire:0 cache to the built-in default handler in dev', async () => {
      const browser = await next.browser('/')
      expect(
        await browser.elementById('expire-zero-value').text()
      ).toBeDateString()

      // In development the default handler keeps `expire: 0` entries (its
      // minimum retention serves them warm across reloads), so it stores rather
      // than skips.
      await retry(async () => {
        expect(next.cliOutput).toMatch(
          /DefaultCacheHandler: set \["[A-Za-z0-9_-]+","([0-9a-f]{2})+",\[{"id":"expire-zero"}]\] done/
        )
      })

      expect(next.cliOutput).not.toMatch(
        /DefaultCacheHandler: set \["[A-Za-z0-9_-]+","([0-9a-f]{2})+",\[{"id":"expire-zero"}]\] skipped/
      )
    })
  }
})
