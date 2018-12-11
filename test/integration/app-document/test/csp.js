/* eslint-env jest */

import webdriver from 'next-webdriver'

export default (context, render) => {
  describe('With CSP enabled', () => {
    it('load without violations', async () => {
      const browser = await webdriver(context.appPort, '/')
      const errLog = await browser.log('browser')
      const nonce = await browser.elementByCss('meta[property="csp-nonce"]').getAttribute('content')
      expect(nonce).toMatch(/\w+=/)
      expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      browser.close()
    })

    it('CSP should fail with inline styles', async () => {
      const browser = await webdriver(context.appPort, '/?withViolation=true')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')[0].level).toEqual('SEVERE')
      browser.close()
    })

    it('CSP should fail when inline script', async () => {
      const browser = await webdriver(context.appPort, '/inline')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')[0].level).toEqual('SEVERE')
      browser.close()
    })
  })
}
