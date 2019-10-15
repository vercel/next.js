/* eslint-env jest */
import 'testcafe'
import webdriver from 'next-webdriver'

export default () => {
  test('should load inline script by hash', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/?withCSP=hash')
    const errLog = await browser.log(['warn', 'error'])
    await t.expect(errLog).eql([])
    await browser.close()
  })

  test('should load inline script by nonce', async t => {
    const browser = await webdriver(t.fixtureCtx.appPort, '/?withCSP=nonce')
    const errLog = await browser.log(['warn', 'error'])
    await t.expect(errLog).eql([])
    await browser.close()
  })
}
