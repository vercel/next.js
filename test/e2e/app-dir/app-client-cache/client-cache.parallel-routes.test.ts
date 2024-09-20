import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import { BrowserInterface } from 'next-webdriver'
import {
  browserConfigWithFixedTime,
  createRequestsListener,
  fastForwardTo,
  getPathname,
} from './test-utils'
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
    let browser: BrowserInterface

    beforeEach(async () => {
      browser = (await next.browser(
        '/',
        browserConfigWithFixedTime
      )) as BrowserInterface
    })

    it('should prefetch the full page', async () => {
      const { getRequests, clearRequests } =
        await createRequestsListener(browser)
      await check(() => {
        return getRequests().some(
          ([url, didPartialPrefetch]) =>
            getPathname(url) === '/0' && !didPartialPrefetch
        )
          ? 'success'
          : 'fail'
      }, 'success')

      clearRequests()

      await browser
        .elementByCss('[href="/0"]')
        .click()
        .waitForElementByCss('#random-number')

      expect(getRequests().every(([url]) => getPathname(url) !== '/0')).toEqual(
        true
      )
    })

    it('should re-use the cache for the full page, only for 5 mins', async () => {
      const randomNumber = await browser
        .elementByCss('[href="/0"]')
        .click()
        .waitForElementByCss('#random-number')
        .text()

      await browser.elementByCss('[href="/"]').click()

      const number = await browser
        .elementByCss('[href="/0"]')
        .click()
        .waitForElementByCss('#random-number')
        .text()

      expect(number).toBe(randomNumber)

      await browser.eval(fastForwardTo, 5 * 60 * 1000)

      await browser.elementByCss('[href="/"]').click()

      const newNumber = await browser
        .elementByCss('[href="/0"]')
        .click()
        .waitForElementByCss('#random-number')
        .text()

      expect(newNumber).not.toBe(randomNumber)
    })
  })
})
