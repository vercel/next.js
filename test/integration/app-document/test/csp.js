/* eslint-env jest */
/* global webdriver */

export default (context, render) => {
  describe('With CSP enabled', () => {
    it('should load inline script by hash', async () => {
      const browser = await webdriver(context.appPort, '/?withCSP=hash')
      if (browser.log) {
        const errLog = await browser.log('browser')
        expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      }
      await browser.close()
    })

    it('should load inline script by nonce', async () => {
      const browser = await webdriver(context.appPort, '/?withCSP=nonce')
      if (browser.log) {
        const errLog = await browser.log('browser')
        expect(errLog.filter((e) => e.source === 'security')).toEqual([])
      }
      await browser.close()
    })
  })
}
