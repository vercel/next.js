/* global describe, it, expect */

import webdriver from 'next-webdriver'

export default (context, render) => {
  describe('With CSP enabled', () => {
    it('should with CSP', async () => {
      const browser = await webdriver(context.appPort, '/?withCSP=secure')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      browser.close()
    })
  })
}
