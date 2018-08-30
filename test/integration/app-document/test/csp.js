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

    it('fail when violations', async () => {
      const browser = await webdriver(context.appPort, '/?withViolation=true')
      const errLog = await browser.log('browser')
      expect(errLog.filter((e) => e.source === 'security')[0].level).toEqual('SEVERE')
      browser.close()
    })

    it('properly applies nonce', async () => {
      const browser = await webdriver(context.appPort, '/')
      const nonce = await browser.elementByCss('meta[property="csp-nonce"]').getAttribute('content')
      expect(nonce).toMatch(/\w+=/)
      browser.close()
    })
  })
}
