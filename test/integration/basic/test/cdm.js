/* global describe, it, expect */
import webdriver from 'next-webdriver'

export default (context) => {
  describe('componentDidMount', () => {
    it('on normal page', async () => {
      const browser = await webdriver(context.appPort, '/with-cdm')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      browser.close()
    })

    it('on /nested-cdm page', async () => {
      const browser = await webdriver(context.appPort, '/nested-cdm')
      const text = await browser.elementByCss('p').text()

      expect(text).toBe('ComponentDidMount executed on client.')
      browser.close()
    })

    it('on /nested-cdm/ page', async () => {
      const browser = await webdriver(context.appPort, '/nested-cdm/')
      const text = await browser.elementByCss('p').text()

      // This fails.
      expect(text).toBe('ComponentDidMount executed on client.')
      browser.close()
    })

    it('on /nested-cdm/index page', async () => {
      const browser = await webdriver(context.appPort, '/nested-cdm/index')
      const text = await browser.elementByCss('p').text()

      // This fails.
      expect(text).toBe('ComponentDidMount executed on client.')
      browser.close()
    })
  })
}
