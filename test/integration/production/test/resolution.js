/* eslint-env jest */

import webdriver from 'next-webdriver'

export default (context) => {
  describe('page resolution', () => {
    describe('client side', () => {
      it('should resolve to js file when no slash', async () => {
        const browser = await webdriver(context.appPort, '/resolution')
        const text = await browser
          .elementByCss('#subfolder1').click()
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder1.js')
        browser.quit()
      })

      it('should resolve to folder index when slash', async () => {
        const browser = await webdriver(context.appPort, '/resolution')
        const text = await browser
          .elementByCss('#subfolder1-slash').click()
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder1/index.js')
        browser.quit()
      })

      it('should resolve to folder index when index', async () => {
        const browser = await webdriver(context.appPort, '/resolution')
        const text = await browser
          .elementByCss('#subfolder1-index').click()
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder1/index.js')
        browser.quit()
      })

      it('should resolve to folder when no slash and no js file', async () => {
        const browser = await webdriver(context.appPort, '/resolution')
        const text = await browser
          .elementByCss('#subfolder2').click()
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder2/index.js')
        browser.quit()
      })

      it('should resolve to folder index when slash and no js file', async () => {
        const browser = await webdriver(context.appPort, '/resolution')
        const text = await browser
          .elementByCss('#subfolder2-slash').click()
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder2/index.js')
        browser.quit()
      })

      it('should resolve to folder index when index and no js file', async () => {
        const browser = await webdriver(context.appPort, '/resolution')
        const text = await browser
          .elementByCss('#subfolder2-index').click()
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder2/index.js')
        browser.quit()
      })
    })

    describe('server side ', () => {
      it('should resolve to js file when no slash', async () => {
        const browser = await webdriver(context.appPort, '/resolution/subfolder1')
        const text = await browser
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder1.js')
        browser.close()
      })

      it('should resolve folder index when slash', async () => {
        const browser = await webdriver(context.appPort, '/resolution/subfolder1/')
        const text = await browser
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder1/index.js')
        browser.close()
      })

      it('should resolve folder index when index', async () => {
        const browser = await webdriver(context.appPort, '/resolution/subfolder1/index')
        const text = await browser
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder1/index.js')
        browser.close()
      })

      it('should resolve to js file when no slash and no js file', async () => {
        const browser = await webdriver(context.appPort, '/resolution/subfolder2')
        const text = await browser
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder2/index.js')
        browser.close()
      })

      it('should resolve to js file when slash and no js file', async () => {
        const browser = await webdriver(context.appPort, '/resolution/subfolder2/')
        const text = await browser
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder2/index.js')
        browser.close()
      })

      it('should resolve folder index when index and no js file', async () => {
        const browser = await webdriver(context.appPort, '/resolution/subfolder2/index')
        const text = await browser
          .waitForElementByCss('.marker')
          .elementByCss('.marker').text()

        expect(text).toBe('This is subfolder2/index.js')
        browser.close()
      })
    })
  })
}
