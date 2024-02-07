import { createNextDescribe } from 'e2e-utils'
import { BrowserInterface } from '../../lib/browsers/base'

createNextDescribe(
  'no-store-transition',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should store response without no-store-transition option', async () => {
      const browser: BrowserInterface = await next.browser('/')
      await browser.waitForElementByCss('#home-page')

      await browser.elementByCss('#to-private-by-link').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#to-private-by-link-without-prefetch').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#to-private-by-push').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#open-private').click()
      await browser.waitForElementByCss('#home-page')

      await browser.elementByCss('#to-private-by-link').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#to-private-by-link-without-prefetch').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#to-private-by-push').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#hide-private').click()
      await browser.waitForElementByCss('#home-page')
    })
    it('should not store response with no-store-transition option', async () => {
      const browser: BrowserInterface = await next.browser('/')
      await browser.waitForElementByCss('#home-page')

      await browser.elementByCss('#to-private-by-link-no-store').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#to-private-by-push-no-store').click()
      await browser.waitForElementByCss('#mock')

      await browser.elementByCss('#open-private').click()
      await browser.waitForElementByCss('#home-page')

      await browser.elementByCss('#to-private-by-link-no-store').click()
      await browser.waitForElementByCss('#private-by-link-page')

      await browser.elementByCss('#to-private-by-push-no-store').click()
      await browser.waitForElementByCss('#private-by-push-page')

      await browser.elementByCss('#hide-private').click()
      await browser.waitForElementByCss('#home-page')
    })
  }
)
