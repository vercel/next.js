import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Navigating to a different hash, or clearing it, must replace the current
// hash, however the route was first reached.
// @force-gate prefetching
describe('hash canonical url', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  type Browser = Awaited<ReturnType<typeof next.browser>>

  async function currentUrl(browser: Browser) {
    return new URL(await browser.url())
  }

  describe('after a direct load with a hash', () => {
    // https://github.com/vercel/next.js/issues/96714
    it('should clear the hash on replace after a direct entry with a hash', async () => {
      const browser = await next.browser('/initial/123#modal')
      await browser.waitForElementByCss('#initial')

      await browser.elementById('replace-without-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/initial/123')
        expect(url.hash).toBe('')
      })
    })

    it('should not produce a double fragment on push after a direct entry with a hash', async () => {
      const browser = await next.browser('/initial/123#modal')
      await browser.waitForElementByCss('#initial')

      await browser.elementById('push-other-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/initial/123')
        expect(url.hash).toBe('#other')
      })
    })
  })

  describe('after a server action', () => {
    it('should clear the hash on replace after a revalidating action', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-action').click()
      await browser.waitForElementByCss('#action')

      await browser.elementById('run-revalidate').click()

      // The action itself must not change the address.
      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/action/123')
        expect(url.hash).toBe('#modal')
      })

      await browser.elementById('replace-without-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/action/123')
        expect(url.hash).toBe('')
      })
    })

    it('should not produce a double fragment on push after a revalidating action', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-action').click()
      await browser.waitForElementByCss('#action')

      await browser.elementById('run-revalidate').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.hash).toBe('#modal')
      })

      await browser.elementById('push-other-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/action/123')
        expect(url.hash).toBe('#other')
      })
    })

    it('should keep the hash of a redirect issued by an action', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-action').click()
      await browser.waitForElementByCss('#action')

      await browser.elementById('run-redirect-with-hash').click()
      await browser.waitForElementByCss('#redirect-target')

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/redirect-target')
        expect(url.hash).toBe('#section')
      })
    })
  })

  describe('after a prefetched link', () => {
    it('should clear the hash on replace after arriving via a prefetched link', async () => {
      const browser = await next.browser('/')
      await browser.elementById('to-prefetch').click()
      await browser.waitForElementByCss('#prefetch')

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.hash).toBe('#modal')
      })

      await browser.elementById('replace-without-hash').click()

      await retry(async () => {
        const url = await currentUrl(browser)
        expect(url.pathname).toBe('/prefetch/123')
        expect(url.hash).toBe('')
      })
    })
  })
})
