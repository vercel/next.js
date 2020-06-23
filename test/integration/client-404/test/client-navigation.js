/* eslint-env jest */
import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'

export default (context) => {
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
  })
}
