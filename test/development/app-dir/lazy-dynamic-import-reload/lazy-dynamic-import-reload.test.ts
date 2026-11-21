import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// @force-gate turbopack
describe('lazy-dynamic-import-reload', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // A client navigation loads the route's chunks without subscribing to their chunk list, so
  // activating a lazy import there advances the client version without sending the page an
  // update. The import's own chunk list must not be checked against that version.
  it.each([
    { name: 'on mount', link: '#to-on-mount', value: 'on mount target' },
    { name: 'on click', link: '#to-on-click', value: 'on click target' },
  ])(
    'does not reload when a lazy import $name compiles after a client navigation',
    async ({ link, value }) => {
      const browser = await next.browser('/')
      await browser.eval('window.__lazyImportDocument = true')

      await browser.elementByCss(link).click()
      if (link === '#to-on-click') {
        await browser.waitForElementByCss('#load', 30_000).click()
      }

      // The first visit compiles the route.
      await retry(async () => {
        expect(await browser.elementByCss('#value').text()).toBe(value)
      }, 30_000)
      expect(await browser.eval('window.__lazyImportDocument')).toBe(true)
    }
  )

  it('applies updates to a lazy import loaded after a client navigation', async () => {
    const browser = await next.browser('/')
    await browser.eval('window.__lazyImportDocument = true')

    await browser.elementByCss('#to-on-mount').click()
    await retry(async () => {
      expect(await browser.elementByCss('#value').text()).toBe(
        'on mount target'
      )
    })

    await next.patchFile(
      'app/on-mount/target.tsx',
      (content) => content.replace('on mount target', 'edited target'),
      async () => {
        await retry(async () => {
          expect(await browser.elementByCss('#value').text()).toBe(
            'edited target'
          )
        })
        expect(await browser.eval('window.__lazyImportDocument')).toBe(true)
      }
    )
  })
})
