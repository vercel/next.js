/* eslint-env jest */

import webdriver from 'next-webdriver'

export default (context, render) => {
  describe('With CSP enabled', () => {
    it('should load inline script by hash', async () => {
      const browser = await webdriver(context.appPort, '/?withCSP=hash')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      browser.close()
    })

    it('should load inline script by nonce', async () => {
      const browser = await webdriver(context.appPort, '/?withCSP=nonce')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      browser.close()
    })
  })
}
