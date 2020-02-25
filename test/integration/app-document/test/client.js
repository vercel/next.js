/* eslint-env jest */
import webdriver from 'next-webdriver'
import { join } from 'path'
import { check, File } from 'next-test-utils'

export default (context, render) => {
  const app = new File(join(__dirname, '../', 'pages', '_app.js'))
  const document = new File(join(__dirname, '../', 'pages', '_document.js'))
  describe('Client side', () => {
    it('should detect the changes to pages/_app.js and display it', async () => {
      let browser
      try {
        browser = await webdriver(context.appPort, '/')
        app.restore()
        await check(
          () => browser.elementByCss('#hello-hmr').text(),
          /Hello HMR/
        )

        // change the content
        app.replace('Hello HMR', 'Hi HMR')
        await check(() => browser.elementByCss('body').text(), /Hi HMR/)

        // add the original content
        app.restore()
        await check(() => browser.elementByCss('body').text(), /Hello HMR/)
      } finally {
        app.restore()
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should detect the changes to pages/_document.js and display it', async () => {
      let browser
      try {
        browser = await webdriver(context.appPort, '/')
        document.restore()
        await check(
          () => browser.elementByCss('#hello-hmr').text(),
          /Hello HMR/
        )

        // change the content
        document.replace('Hello Document HMR', 'Hi Document HMR')
        await check(
          () => browser.elementByCss('body').text(),
          /Hi Document HMR/
        )

        // add the original content
        document.restore()
        await check(
          () => browser.elementByCss('body').text(),
          /Hello Document HMR/
        )
      } finally {
        document.restore()
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should keep state between page navigations', async () => {
      const browser = await webdriver(context.appPort, '/')

      const randomNumber = await browser.elementByCss('#random-number').text()

      const switchedRandomNumer = await browser
        .elementByCss('#about-link')
        .click()
        .waitForElementByCss('.page-about')
        .elementByCss('#random-number')
        .text()

      expect(switchedRandomNumer).toBe(randomNumber)
      await browser.close()
    })

    it('It should share module state with pages', async () => {
      const browser = await webdriver(context.appPort, '/shared')

      const text = await browser.elementByCss('#currentstate').text()
      expect(text).toBe('UPDATED CLIENT')
      await browser.close()
    })
  })
}
