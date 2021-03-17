/* eslint-env jest */
import webdriver from 'next-webdriver'
import { check, waitFor } from 'next-test-utils'

export default (context, isProd = false) => {
  describe('Client Navigation 404', () => {
    describe('should show 404 upon client replacestate', () => {
      it('should navigate the page', async () => {
        const browser = await webdriver(context.appPort, '/asd')
        const serverCode = await browser
          .waitForElementByCss('#errorStatusCode')
          .text()
        await browser.waitForElementByCss('#errorGoHome').click()
        await browser.waitForElementByCss('#hellom8').back()
        const clientCode = await browser
          .waitForElementByCss('#errorStatusCode')
          .text()

        expect({ serverCode, clientCode }).toMatchObject({
          serverCode: '404',
          clientCode: '404',
        })
        await browser.close()
      })
    })

    it('should hard navigate to URL on failing to load bundle', async () => {
      const browser = await webdriver(context.appPort, '/invalid-link')
      await browser.eval(() => (window.beforeNav = 'hi'))
      await browser.elementByCss('#to-nonexistent').click()
      await check(() => browser.elementByCss('#errorStatusCode').text(), /404/)
      expect(await browser.eval(() => window.beforeNav)).not.toBe('hi')
    })

    if (isProd) {
      it('should hard navigate to URL on failing to load missing bundle', async () => {
        const browser = await webdriver(context.appPort, '/to-missing-link')
        await browser.eval(() => (window.beforeNav = 'hi'))
        expect(
          await browser.eval(() =>
            document.querySelector('script[src*="pages/missing"]')
          )
        ).toBeFalsy()
        await browser.elementByCss('#to-missing').moveTo()
        await waitFor(2000)
        expect(
          await browser.eval(() =>
            document.querySelector('script[src*="pages/missing"]')
          )
        ).toBeTruthy()
        await browser.elementByCss('#to-missing').click()
        await waitFor(2000)
        expect(await browser.eval(() => window.beforeNav)).not.toBe('hi')
        await check(() => browser.elementByCss('#missing').text(), /poof/)
      })
    }
  })
}
