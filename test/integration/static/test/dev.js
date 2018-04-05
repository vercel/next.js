/* global describe, it, expect */
import webdriver from 'next-webdriver'

export default function (context) {
  describe('Render in development mode', () => {
    it('should render the home page', async () => {
      const browser = await webdriver(context.port, '/')
      const text = await browser
        .elementByCss('#home-page p').text()

      expect(text).toBe('This is the home page')
      browser.close()
    })

    it('should render pages only existent in exportPathMap page', async () => {
      const browser = await webdriver(context.port, '/dynamic/one')
      const text = await browser
        .elementByCss('#dynamic-page p').text()

      expect(text).toBe('next export is nice')
      browser.close()
    })
  })
}
