import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'
import { browserConfigWithFixedTime, fastForwardTo } from './test-utils'
import path from 'path'

describe('app dir client cache with parallel routes', () => {
  const { next, isNextDev } = nextTestSetup({
    files: path.join(__dirname, 'fixtures', 'parallel-routes'),
  })

  if (isNextDev) {
    // dev doesn't support prefetch={true}
    it('should skip dev', () => {})
    return
  }

  describe('prefetch={true}', () => {
    it('should prefetch the full page', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          browserConfigWithFixedTime.beforePageLoad(page)
          act = createRouterAct(page)
        },
      })

      // Reveal the link to trigger prefetch and wait for it to complete
      const link = await act(
        async () => {
          const reveal = await browser.elementByCss(
            '[data-link-accordion="/0"]'
          )
          await reveal.click()
          return await browser.elementByCss('[href="/0"]')
        },
        { includes: 'random-number' }
      )

      // Navigate to /0 - should not make additional requests
      await act(async () => {
        await link.click()
        await browser.waitForElementByCss('#random-number')
      }, 'no-requests')
    })

    it('should re-use the cache for the full page, only for 5 mins', async () => {
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/', {
        beforePageLoad(page) {
          browserConfigWithFixedTime.beforePageLoad(page)
          act = createRouterAct(page)
        },
      })

      // Toggle the link, assert on the prefetch content
      const link = await act(
        async () => {
          const reveal = await browser.elementByCss(
            '[data-link-accordion="/0"]'
          )
          await reveal.click()
          return await browser.elementByCss('[href="/0"]')
        },
        { includes: 'random-number' }
      )

      // Navigate to the page, assert no requests are made
      const randomNumber = await act(async () => {
        await link.click()
        await browser.waitForElementByCss('#random-number')
        return await browser.elementByCss('#random-number').text()
      }, 'no-requests')

      // Toggle the home link, assert on the homepage content
      const homeLink = await act(
        async () => {
          const reveal = await browser.elementByCss('[data-link-accordion="/"]')
          await reveal.click()
          return await browser.elementByCss('[href="/"]')
        },
        { includes: 'home-page' }
      )

      // Navigate home, assert no requests are made
      await act(async () => {
        await homeLink.click()
        await browser.waitForElementByCss('#home-page')
      }, 'no-requests')

      // Toggle the link to the other page again, navigate, assert no requests (because it's cached)
      const number = await act(async () => {
        const reveal = await browser.elementByCss('[data-link-accordion="/0"]')
        await reveal.click()
        const link = await browser.elementByCss('[href="/0"]')
        await link.click()
        await browser.waitForElementByCss('#random-number')
        return await browser.elementByCss('#random-number').text()
      }, 'no-requests')

      expect(number).toBe(randomNumber)

      // Navigate back home
      await act(async () => {
        const reveal = await browser.elementByCss('[data-link-accordion="/"]')
        await reveal.click()
        const homeLink = await browser.elementByCss('[href="/"]')
        await homeLink.click()
        await browser.waitForElementByCss('#home-page')
      }, 'no-requests')

      // Fast forward 5 minutes
      await browser.eval(fastForwardTo, 5 * 60 * 1000)

      // Toggle the link to the other page again, assert on prefetch content
      const linkAfterExpiry = await act(
        async () => {
          const reveal = await browser.elementByCss(
            '[data-link-accordion="/0"]'
          )
          await reveal.click()
          return await browser.elementByCss('[href="/0"]')
        },
        { includes: 'random-number' }
      )

      // Navigate to the page and verify the content is fresh (different from cached)
      const newNumber = await act(async () => {
        await linkAfterExpiry.click()
        await browser.waitForElementByCss('#random-number')
        return await browser.elementByCss('#random-number').text()
      }, 'no-requests')

      expect(newNumber).not.toBe(randomNumber)
    })
  })
})
