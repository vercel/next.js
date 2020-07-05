/* eslint-env jest */
import {
  check,
  File,
  getBrowserBodyText,
  getRedboxHeader,
  getRedboxSource,
  hasRedbox,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

export default (context, renderViaHTTP) => {
  describe('Error Recovery', () => {
    it('should recover from 404 after a page has been added', async () => {
      let browser
      const newPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'new-page.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/new-page')

        expect(await browser.elementByCss('body').text()).toMatch(
          /This page could not be found/
        )

        // Add the page
        newPage.write(
          'export default () => (<div id="new-page">the-new-page</div>)'
        )

        await check(() => getBrowserBodyText(browser), /the-new-page/)

        newPage.delete()

        await check(
          () => getBrowserBodyText(browser),
          /This page could not be found/
        )
      } catch (err) {
        newPage.delete()
        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should detect syntax errors and recover', async () => {
      let browser
      const aboutPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'about2.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/about2')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        aboutPage.replace('</div>', 'div')

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxSource(browser)).toMatch(
          /Unterminated JSX contents/
        )

        aboutPage.restore()

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } catch (err) {
        aboutPage.restore()
        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        }

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should show the error on all pages', async () => {
      const aboutPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'about2.js')
      )
      let browser
      try {
        await renderViaHTTP('/hmr/about2')

        aboutPage.replace('</div>', 'div')

        browser = await webdriver(context.appPort, '/hmr/contact')

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxSource(browser)).toMatch(
          /Unterminated JSX contents/
        )

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the contact page/
        )
      } catch (err) {
        aboutPage.restore()
        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the contact page/
          )
        }

        throw err
      } finally {
        aboutPage.restore()
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should detect runtime errors on the module scope', async () => {
      let browser
      const aboutPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'about3.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/about3')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        aboutPage.replace('export', 'aa=20;\nexport')

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatch(/aa is not defined/)

        aboutPage.restore()

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } finally {
        aboutPage.restore()
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover from errors in the render function', async () => {
      let browser
      const aboutPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'about4.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/about4')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        aboutPage.replace(
          'return',
          'throw new Error("an-expected-error");\nreturn'
        )

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxSource(browser)).toMatch(/an-expected-error/)

        aboutPage.restore()

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } catch (err) {
        aboutPage.restore()
        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        }

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover after exporting an invalid page', async () => {
      let browser
      const aboutPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'about5.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/about5')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        aboutPage.replace(
          'export default',
          'export default {};\nexport const fn ='
        )

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Server Error

          Error: The default export is not a React Component in page: \\"/hmr/about5\\"

          This error happened while generating the page. Any console logs will be displayed in the terminal window."
        `)

        aboutPage.restore()

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } catch (err) {
        aboutPage.restore()

        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        }

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover after a bad return from the render function', async () => {
      let browser
      const aboutPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'about6.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/about6')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        aboutPage.replace(
          'export default',
          'export default () => /search/;\nexport const fn ='
        )

        expect(await hasRedbox(browser)).toBe(true)
        // TODO: Replace this when webpack 5 is the default
        expect(
          (await getRedboxHeader(browser)).replace(
            '__WEBPACK_DEFAULT_EXPORT__',
            'Unknown'
          )
        ).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Server Error

          Error: Objects are not valid as a React child (found: /search/). If you meant to render a collection of children, use an array instead.
              in Unknown
              in App
              in Unknown
              in Context.Provider
              in Context.Provider
              in Context.Provider
              in Context.Provider
              in AppContainer

          This error happened while generating the page. Any console logs will be displayed in the terminal window."
        `)

        aboutPage.restore()

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } catch (err) {
        aboutPage.restore()

        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        }

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover after undefined exported as default', async () => {
      let browser
      const aboutPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'about7.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/about7')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        aboutPage.replace(
          'export default',
          'export default undefined;\nexport const fn ='
        )

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Server Error

          Error: The default export is not a React Component in page: \\"/hmr/about7\\"

          This error happened while generating the page. Any console logs will be displayed in the terminal window."
        `)

        aboutPage.restore()

        await check(() => getBrowserBodyText(browser), /This is the about page/)
        expect(await hasRedbox(browser, false)).toBe(false)
      } catch (err) {
        aboutPage.restore()

        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        }

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover from errors in getInitialProps in client', async () => {
      let browser
      const erroredPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr')
        await browser.elementByCss('#error-in-gip-link').click()

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Unhandled Runtime Error

          Error: an-expected-error-in-gip"
        `)

        erroredPage.replace('throw error', 'return {}')

        await check(() => getBrowserBodyText(browser), /Hello/)

        erroredPage.restore()

        await check(async () => {
          await browser.refresh()
          const text = await browser.elementByCss('body').text()
          if (text.includes('Hello')) {
            await waitFor(2000)
            throw new Error('waiting')
          }
          return getRedboxSource(browser)
        }, /an-expected-error-in-gip/)
      } catch (err) {
        erroredPage.restore()

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover after an error reported via SSR', async () => {
      let browser
      const erroredPage = new File(
        join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js')
      )
      try {
        browser = await webdriver(context.appPort, '/hmr/error-in-gip')

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Server Error

          Error: an-expected-error-in-gip

          This error happened while generating the page. Any console logs will be displayed in the terminal window."
        `)

        const erroredPage = new File(
          join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js')
        )
        erroredPage.replace('throw error', 'return {}')

        await check(() => getBrowserBodyText(browser), /Hello/)

        erroredPage.restore()

        await check(async () => {
          await browser.refresh()
          const text = await getBrowserBodyText(browser)
          if (text.includes('Hello')) {
            await waitFor(2000)
            throw new Error('waiting')
          }
          return getRedboxSource(browser)
        }, /an-expected-error-in-gip/)
      } catch (err) {
        erroredPage.restore()

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
}
