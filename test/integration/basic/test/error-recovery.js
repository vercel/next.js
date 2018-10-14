/* eslint-env jest */
import webdriver from 'next-webdriver'
import { asserters } from 'wd'
import { join } from 'path'
import { fsTimeMachine, waitFor } from 'next-test-utils'

export default (context, render) => {
  describe('Error Recovery', () => {
    it('should recover from 404 after a page has been added', async () => {
      const newPage = await fsTimeMachine(join(__dirname, '../pages/hmr/new-page.js'))
      const browser = await webdriver(context.appPort, '/hmr/new-page')

      await browser.waitFor(asserters.textInclude('This page could not be found'), 30000)

      // Add the page
      await newPage.write('export default () => (<div id="new-page">the-new-page</div>)')
      await browser.waitForElementByCss('#new-page', 30000)

      // Delete the page
      await newPage.restore()
      await browser.waitFor(asserters.textInclude('This page could not be found'), 30000)

      await browser.quit()
    })

    it('should have installed the react-overlay-editor editor handler', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
      await aboutPage.replace('</div>', 'div')

      const errorOverlayContent = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 60000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)

      // react-error-overlay uses the following inline style if an editorHandler is installed
      expect(errorOverlayContent).toMatch(/style="cursor: pointer;"/)

      await aboutPage.restore()
      await browser.waitFor(asserters.textInclude('This is the about page'), 30000)

      await browser.quit()
    })

    it('should detect syntax errors and recover', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))

      const text = await browser.elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      await aboutPage.replace('</div>', 'div')
      const errorOverlayContent = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 30000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
      expect(errorOverlayContent).toMatch(/Unterminated JSX contents/)

      await aboutPage.restore()
      await browser.waitFor(asserters.textInclude('This is the about page.'), 30000)

      await browser.quit()
    })

    it('should show the error on all pages', async () => {
      const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
      const browser = await webdriver(context.appPort, '/hmr/contact')

      await aboutPage.replace('</div>', 'div')

      const errorOverlayContent = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 30000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
      expect(errorOverlayContent).toMatch(/Unterminated JSX contents/)

      await aboutPage.restore()
      await browser.waitFor(asserters.textInclude('This is the contact page'), 30000)

      await Promise.all([
        aboutPage.restore(),
        browser.quit()
      ])
    })

    it('should detect runtime errors on the module scope', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))

      const text = await browser.elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      await aboutPage.replace('export', 'aa=20;\nexport')
      const errorOverlayContent = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 30000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
      expect(errorOverlayContent).toMatch(/aa is not defined/)

      await aboutPage.restore()
      await browser.waitFor(asserters.textInclude('This is the about page'), 30000)

      await Promise.all([
        aboutPage.restore(),
        browser.quit()
      ])
    })

    it('should recover from errors in the render function', async () => {
      const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
      const browser = await webdriver(context.appPort, '/hmr/about')

      await browser.waitForElementByCss('p', asserters.textInclude('This is the about page.'), 30000)

      await aboutPage.replace('return', 'throw new Error("an-expected-error");\nreturn')

      const errorOverlayContent = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 30000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
      expect(errorOverlayContent).toMatch(/an-expected-error/)

      await aboutPage.restore()
      await browser.waitFor(asserters.textInclude('This is the about page'), 30000)

      await browser.quit()
    })

    it('should recover after exporting an invalid page', async () => {
      const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
      const browser = await webdriver(context.appPort, '/hmr/about')

      await browser.waitForElementByCss('p', asserters.textInclude('This is the about page.'), 30000)

      await aboutPage.replace('export default', 'export default "not-a-page"\nexport const fn = ')
      await browser.waitFor(asserters.textInclude('The default export is not a React Component'), 30000)

      await aboutPage.restore()
      await browser.waitFor(asserters.textInclude('This is the about page'), 30000)

      await browser.quit()
    })

    it('should recover after a bad return from the render function', async () => {
      const aboutPage = await fsTimeMachine(join(__dirname, '../pages/hmr/about.js'))
      const browser = await webdriver(context.appPort, '/hmr/about')

      await browser.waitForElementByCss('p', asserters.textInclude('This is the about page.'), 30000)

      await aboutPage.replace('export default', 'export default () => /search/ \nexport const fn = ')
      await browser.waitFor(asserters.textInclude('Objects are not valid as a React child'), 30000)

      await aboutPage.restore()
      await browser.waitFor(asserters.textInclude('This is the about page'), 30000)

      await browser.quit()
    })

    it('should recover from errors in getInitialProps in client', async () => {
      const erroredPage = await fsTimeMachine(join(__dirname, '../pages/hmr/error-in-gip.js'))
      const browser = await webdriver(context.appPort, '/hmr')

      await browser
        .waitForElementByCss('#error-in-gip-link', 30000)
        .elementByCss('#error-in-gip-link').click()

      const errorOverlayContent = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 30000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
      expect(errorOverlayContent).toMatch(/an-expected-error-in-gip/)

      await erroredPage.replace('throw error', 'return {}')
      await browser.waitFor(asserters.textInclude('Hello'), 30000)

      await erroredPage.restore()

      // TODO: We need to refresh here in order to get the error overlay.
      // This is a next bug that should be resolved in the future!
      await waitFor(5000)
      await browser.refresh()

      const errorOverlayContent2 = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 30000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
      expect(errorOverlayContent2).toMatch(/an-expected-error-in-gip/)

      await Promise.all([
        erroredPage.restore(),
        browser.quit()
      ])
    })

    it('should recover after an error reported via SSR', async () => {
      const erroredPage = await fsTimeMachine(join(__dirname, '../pages/hmr/error-in-gip.js'))
      const browser = await webdriver(context.appPort, '/hmr/error-in-gip')

      const errorOverlayContent = await browser
        .waitForElementByCss('iframe', asserters.isDisplayed, 30000)
        .eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
      expect(errorOverlayContent).toMatch(/an-expected-error-in-gip/)

      await erroredPage.replace('throw error', 'return {}')
      await browser.waitFor(asserters.textInclude('Hello'), 30000)

      await erroredPage.restore()

      // TODO: We need to refresh here in order to get the error overlay.
      // This is a next bug that should be resolved in the future!
      await waitFor(5000)
      await browser.refresh()

      await browser.quit()
    })
  })
}
