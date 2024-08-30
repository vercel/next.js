import { nextTestSetup } from 'e2e-utils'
import { locales } from './components/page'

describe('ppr-navigations simple', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('can navigate between all the links and back', async () => {
    const browser = await next.browser('/')

    try {
      for (const href of ['/fr/about', '/fr', '/en/about', '/en', '/']) {
        // Find the link element for the href and click it.
        await browser.elementByCss(`a[href="${href}"]`).click()

        // Wait for that page to load.
        if (href === '/') {
          // The root page redirects to the first locale.
          await browser.waitForElementByCss(`[data-value="/${locales[0]}"]`)
        } else {
          await browser.waitForElementByCss(`[data-value="${href}"]`)
        }

        await browser.elementByCss('#dynamic')
      }
    } finally {
      await browser.close()
    }
  })
})
