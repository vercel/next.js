/* global describe, it, expect */

import webdriver from 'next-webdriver'

export default (context, render) => {
  describe('With CSP enabled', () => {
    it('load without violations', async () => {
      const browser = await webdriver(context.appPort, '/')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      browser.close()
    })
  })
}
