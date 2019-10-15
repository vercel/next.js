/* global test */
import 'testcafe'
import webdriver from 'next-webdriver'

export default () => {
  test('should set process.env.NODE_ENV in development', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/process-env')
    const nodeEnv = await browser.elementByCss('#node-env').text()
    await t.expect(nodeEnv).eql('development')
    await browser.close()
  })
}
