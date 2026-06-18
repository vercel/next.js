import { nextTestSetup } from 'e2e-utils'

describe('hydrate/render ordering', () => {
  describe('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    it('correctly measures hydrate followed by render', async () => {
      const browser = await next.browser('/')
      await browser.waitForElementByCss('#to-other')
      await browser.elementByCss('#to-other').click()
      await browser.waitForElementByCss('#on-other', { state: 'attached' })

      const beacons = (await browser.eval('window.__BEACONS'))
        .map(([, value]) => Object.fromEntries(new URLSearchParams(value)))
        .filter((p) => p.label === 'custom')
      expect(beacons).toMatchObject([
        { name: 'Next.js-hydration' },
        { name: 'Next.js-render' },
        { name: 'Next.js-route-change-to-render' },
      ])

      await browser.close()
    })
  })
})
