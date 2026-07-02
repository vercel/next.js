import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('app dir - not-found with search params back navigation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  describe('programmatic notFound() with search params', () => {
    // Tests that calling notFound() programmatically (e.g., based on searchParams)
    // correctly handles back navigation. Previously, there was a bug where the
    // router would get stuck when navigating back - the URL would change but
    // the content would remain on the 404 page.

    it('should recover from programmatic notFound() when navigating back via browser history', async () => {
      const browser = await next.browser('/')

      // Verify we're on the home page
      expect(await browser.elementByCss('#home-title').text()).toBe('Home Page')
      expect(await browser.elementByCss('#current-page').text()).toBe(
        'Current page: 1'
      )

      // Click on page 11 which should trigger notFound()
      await browser.elementByCss('#link-to-page-11').click()

      // Wait for the not-found page to be displayed
      await browser.waitForElementByCss('#not-found-title')
      expect(await browser.elementByCss('#not-found-title').text()).toBe(
        'Page Not Found'
      )

      // Click browser back button
      await browser.back()

      // Verify the URL is correct
      const url = new URL(await browser.url())
      expect(url.pathname).toBe('/')

      // The page should recover and show the home page content
      await retry(async () => {
        expect(await browser.elementByCss('#home-title').text()).toBe(
          'Home Page'
        )
      })
    })
  })
})
