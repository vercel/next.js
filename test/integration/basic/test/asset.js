/* eslint-env jest */
import cheerio from 'cheerio'
import {
  renderViaHTTP
} from 'next-test-utils'
import webdriver from 'next-webdriver'

export default (context) => {
  async function get$ (path) {
    const html = await renderViaHTTP(context.appPort, path)
    return cheerio.load(html)
  }

  describe('With next/asset', () => {
    describe('with SSR', () => {
      it('should handle beginning slash properly', async () => {
        const $ = await get$('/using-asset/asset')
        expect($('#img1').attr('src')).toBe('/static/the-image')
        expect($('#img2').attr('src')).toBe('/static/the-image')
      })

      it('should handle http(s) properly', async () => {
        const $ = await get$('/using-asset/asset')
        expect($('#img3').attr('src')).toBe('http://the-image.com/the-image')
        expect($('#img4').attr('src')).toBe('https://the-image.com/the-image')
      })
    })

    describe('with client navigation', () => {
      it('should handle beginning slash properly', async () => {
        const browser = await webdriver(context.appPort, '/using-asset')
        await browser
          .elementByCss('#go-asset').click()
          .waitForElementByCss('#asset-page')

        expect(await browser.elementByCss('#img1').getAttribute('src'))
          .toBe(`http://localhost:${context.appPort}/static/the-image`)
        expect(await browser.elementByCss('#img2').getAttribute('src'))
          .toBe(`http://localhost:${context.appPort}/static/the-image`)
        browser.close()
      })

      it('should handle http(s) properly', async () => {
        const browser = await webdriver(context.appPort, '/using-asset')
        await browser
          .elementByCss('#go-asset').click()
          .waitForElementByCss('#asset-page')

        expect(await browser.elementByCss('#img3').getAttribute('src'))
          .toBe('http://the-image.com/the-image')
        expect(await browser.elementByCss('#img4').getAttribute('src'))
          .toBe('https://the-image.com/the-image')
        browser.close()
      })
    })
  })
}
