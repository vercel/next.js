/* eslint-env jest */
import webdriver from 'next-webdriver'
import { fsTimeMachine } from 'next-test-utils'
import { Asserter } from 'wd'
import { join } from 'path'

const computedCssAsserter = (prop, value) => {
  return new Asserter(async (el) => {
    const val = await el.getComputedCss(prop)
    return val === value
  })
}

export default (context, render) => {
  describe('Configuration', () => {
    it('should have config available on the client', async () => {
      const browser = await webdriver(context.appPort, '/next-config')

      // Wait for client side to load
      await browser.executeAsync(
        'const args = Array.from(arguments);' +
        'const done = args[args.length -1];' +
        'window.requestIdleCallback(done);'
      )

      const serverText = await browser.elementByCss('#server-only').text()
      expect(serverText).toBe('')

      const serverClientText = await browser.elementByCss('#server-and-client').text()
      expect(serverClientText).toBe('/static')

      browser.close()
    })

    it('should update css styles using hmr', async () => {
      const webpackCssFile = await fsTimeMachine(join(__dirname, '../components/hello-webpack-css.css'))
      const browser = await webdriver(context.appPort, '/webpack-css')

      const pTag = await browser.elementByCss('.hello-world')
      const initialFontSize = await pTag.getComputedCss('font-size')

      expect(initialFontSize).toBe('100px')

      await webpackCssFile.replace('100px', '200px')
      await browser.waitForElementByCss('.hello-world', computedCssAsserter('font-size', '200px'), 20000)

      await Promise.all([
        webpackCssFile.restore(),
        browser.quit()
      ])
    })

    it('should update sass styles using hmr', async () => {
      const file = await fsTimeMachine(join(__dirname, '../components/hello-webpack-sass.scss'))
      const browser = await webdriver(context.appPort, '/webpack-css')

      const computedColor = await browser.elementByCss('.hello-world').getComputedCss('color')
      expect(computedColor).toBe('rgba(255, 255, 0, 1)')

      await file.replace('yellow', 'red')
      await browser.waitForElementByCss('.hello-world', computedCssAsserter('color', 'rgba(255, 0, 0, 1)'), 20000)

      await file.restore()
      await browser.waitForElementByCss('.hello-world', computedCssAsserter('color', 'rgba(255, 255, 0, 1)'), 20000)

      await browser.quit()
    })
  })
}
