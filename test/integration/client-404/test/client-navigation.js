/* eslint-env jest */
import webdriver from 'next-webdriver'

export default context => {
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
          clientCode: '404'
        })
        await browser.close()
      })
    })
  })
}
