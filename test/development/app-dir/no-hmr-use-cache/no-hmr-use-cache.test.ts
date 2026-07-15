import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// With HMR disabled, `serverComponentChanges` messages still arrive over the
// dev websocket and update the `__next_hmr_refresh_hash__` cookie (they just
// don't trigger a client-side refresh), so edited `"use cache"` functions
// must serve fresh data on the next manual refresh.
describe('no-hmr-use-cache', () => {
  const { next, isTurbopack, isNextDev } = nextTestSetup({
    files: __dirname,
    startArgs: ['--no-hmr'],
  })

  if (!isNextDev || !isTurbopack) {
    it('should be skipped outside Turbopack dev', () => {})
    return
  }

  it('serves fresh data from an edited "use cache" function on refresh', async () => {
    const browser = await next.browser('/')
    expect(await browser.elementByCss('#cached-value').text()).toBe(
      'cached value v1'
    )

    await next.patchFile(
      'app/data.ts',
      (content) => content!.replace('cached value v1', 'cached value v2'),
      async () => {
        await retry(async () => {
          await browser.refresh()
          expect(await browser.elementByCss('#cached-value').text()).toBe(
            'cached value v2'
          )
        })
      }
    )
  })
})
