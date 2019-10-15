/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'

export default () => {
  test('should navigate the page', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/asd')
    const serverCode = await browser.elementByCss('#errorStatusCode').text()

    await browser.elementByCss('#errorGoHome').click()
    await browser.waitForElementByCss('#hellom8')
    await browser.back()

    const clientCode = await browser.elementByCss('#errorStatusCode').text()

    await t.expect({ serverCode, clientCode }).eql({
      serverCode: '404',
      clientCode: '404'
    })
    await browser.close()
  })
}
