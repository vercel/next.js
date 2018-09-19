/* global describe, it, expect */
import webdriver from 'next-webdriver'

export default (context) => {
  describe('process.env', () => {
    it('should set process.env.NODE_ENV in production', async () => {
      const browser = await webdriver(context.appPort, '/process-env')
      const nodeEnv = await browser.elementByCss('#node-env').text()
      expect(nodeEnv).toBe('production')
      browser.close()
    })
  })
}
