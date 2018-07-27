/* global describe, it, expect */

import webdriver from 'next-webdriver'
import { waitFor } from 'next-test-utils'

export default (context, render) => {
  describe('Configuration', () => {
    it('should have config available on the client', async () => {
      const browser = await webdriver(context.appPort, '/next-config')
      // Wait for client side to load
      await waitFor(5000)

      const serverText = await browser.elementByCss('#server-only').text()
      const serverClientText = await browser.elementByCss('#server-and-client').text()

      expect(serverText).toBe('')
      expect(serverClientText).toBe('/static')
      browser.close()
    })
  })
}
