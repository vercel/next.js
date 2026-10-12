import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('catchall-parallel-routes-group', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    it('orders the canonical page last in the app path routes manifest', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/app-path-routes-manifest.json')
      )
      const entries = Object.entries(manifest)
        .filter(([, pathname]) => pathname === '/[...catchAll]')
        .map(([entry]) => entry)

      expect(entries).toEqual([
        '/[...catchAll]/@slot/(group)/page',
        '/[...catchAll]/page',
      ])
    })
  }

  it('should work without throwing any errors about invalid pages', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(/Root Page/)
    })
    await browser.elementByCss('[href="/foobar"]').click()

    // catch all matches page, but also slot with layout and group
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(
        /Catch-all Page/
      )
    })
    await retry(async () => {
      expect(await browser.elementByCss('body').text()).toMatch(
        /Catch-all Slot Group Page/
      )
    })
  })
})
