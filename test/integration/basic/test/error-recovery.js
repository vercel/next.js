/* global describe, it, expect */
import webdriver from 'next-webdriver'
import { join } from 'path'
import { check, File, waitFor } from 'next-test-utils'

// react-error-overlay uses an iframe so we have to read the contents from the frame
function getReactErrorOverlayContent(browser) {
  return browser.eval(`document.querySelector('iframe').contentWindow.document.body.innerHTML`)
}

export default (context, render) => {
  describe('Error Recovery', () => {
    it('should detect syntax errors and recover', async () => {
      let browser
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser
          .elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('</div>', 'div')

        await waitFor(3000)

        expect(await getReactErrorOverlayContent(browser)).toMatch(/Unterminated JSX contents/)

        aboutPage.restore()

        await check(
          () => browser.elementByCss('body').text(),
          /This is the about page/
        )
      } finally {
        aboutPage.restore()

        if (browser) {
          browser.close()
        }
      }
    })

    it('should not show the default HMR error overlay', async () => {
      let browser
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser
          .elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('</div>', 'div')

        await waitFor(3000)

        expect(await getReactErrorOverlayContent(browser)).toMatch(/Unterminated JSX contents/)

        await waitFor(2000)

        // Check for the error overlay
        const bodyHtml = await browser.elementByCss('body').getAttribute('innerHTML')
        expect(bodyHtml.includes('webpack-hot-middleware-clientOverlay')).toBeFalsy()
      } finally {
        aboutPage.restore()
        if (browser) {
          browser.close()
        }
      }
    })

    it('should show the error on all pages', async () => {
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      let browser
      try {
        aboutPage.replace('</div>', 'div')

        browser = await webdriver(context.appPort, '/hmr/contact')

        await waitFor(3000)

        expect(await getReactErrorOverlayContent(browser)).toMatch(/Unterminated JSX contents/)

        aboutPage.restore()

        await check(
          () => browser.elementByCss('body').text(),
          /This is the contact page/
        )
      } finally {
        aboutPage.restore()
        if (browser) {
          browser.close()
        }
      }
    })

    it('should detect runtime errors on the module scope', async () => {
      let browser
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser
          .elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('export', 'aa=20;\nexport')

        await waitFor(3000)

        expect(await getReactErrorOverlayContent(browser)).toMatch(/aa is not defined/)

        aboutPage.restore()

        await check(
          () => browser.elementByCss('body').text(),
          /This is the about page/
        )
      } finally {
        aboutPage.restore()
        if (browser) {
          browser.close()
        }
      }
    })

    it('should recover from errors in the render function', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const text = await browser
        .elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('return', 'throw new Error("an-expected-error");\nreturn')

      await waitFor(3000)

      expect(await getReactErrorOverlayContent(browser)).toMatch(/an-expected-error/)

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the about page/
      )

      browser.close()
    })

    it('should recover after exporting an invalid page', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const text = await browser
        .elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('export default', 'export default "not-a-page"\nexport const fn = ')

      await waitFor(3000)
    
      expect(await getReactErrorOverlayContent(browser)).toMatch(/The default export is not a React Component/)

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the about page/
      )

      browser.close()
    })

    it('should recover after a bad return from the render function', async () => {
      const browser = await webdriver(context.appPort, '/hmr/about')
      const text = await browser
        .elementByCss('p').text()
      expect(text).toBe('This is the about page.')

      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('export default', 'export default () => /search/ \nexport const fn = ')

      await check(
        () => browser.elementByCss('body').text(),
        /Objects are not valid as a React child/
      )

      aboutPage.restore()

      await check(
        () => browser.elementByCss('body').text(),
        /This is the about page/
      )

      browser.close()
    })

    it('should recover from errors in getInitialProps in client', async () => {
      const browser = await webdriver(context.appPort, '/hmr')
      await browser.elementByCss('#error-in-gip-link').click()

      await check(
        () => browser.elementByCss('body').text(),
        /an-expected-error-in-gip/
      )

      const erroredPage = new File(join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js'))
      erroredPage.replace('throw error', 'return {}')

      await check(
        () => browser.elementByCss('body').text(),
        /Hello/
      )

      erroredPage.restore()
      browser.close()
    })

    it('should recover after an error reported via SSR', async () => {
      const browser = await webdriver(context.appPort, '/hmr/error-in-gip')

      await check(
        () => browser.elementByCss('body').text(),
        /an-expected-error-in-gip/
      )

      const erroredPage = new File(join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js'))
      erroredPage.replace('throw error', 'return {}')

      await check(
        () => browser.elementByCss('body').text(),
        /Hello/
      )

      erroredPage.restore()
      browser.close()
    })

    it('should recover from 404 after a page has been added', async () => {
      const browser = await webdriver(context.appPort, '/hmr/new-page')

      await check(
        () => browser.elementByCss('body').text(),
        /This page could not be found/
      )

      // Add the page
      const newPage = new File(join(__dirname, '../', 'pages', 'hmr', 'new-page.js'))
      newPage.write('export default () => (<div>the-new-page</div>)')

      await check(
        () => browser.elementByCss('body').text(),
        /the-new-page/
      )

      newPage.delete()
      browser.close()
    })
  })
}
