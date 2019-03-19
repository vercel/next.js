/* eslint-env jest */
import webdriver from 'next-webdriver'
import { join } from 'path'
import { check, File, waitFor, getReactErrorOverlayContent, getBrowserBodyText } from 'next-test-utils'

export default (context, renderViaHTTP) => {
  describe('Error Recovery', () => {
    it('should recover from 404 after a page has been added', async () => {
      let browser
      const newPage = new File(join(__dirname, '../', 'pages', 'hmr', 'new-page.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/new-page')

        expect(await browser.elementByCss('body').text()).toMatch(/This page could not be found/)

        // Add the page
        newPage.write('export default () => (<div id="new-page">the-new-page</div>)')

        await check(
          () => getBrowserBodyText(browser),
          /the-new-page/
        )

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

    it('should have installed the react-overlay-editor editor handler', async () => {
      let browser
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      aboutPage.replace('</div>', 'div')

      try {
        browser = await webdriver(context.appPort, '/hmr/about')

        // react-error-overlay uses the following inline style if an editorHandler is installed
        expect(await getReactErrorOverlayContent(browser)).toMatch(/style="cursor: pointer;"/)

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the about page/
        )
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

    it('should detect syntax errors and recover', async () => {
      let browser
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('</div>', 'div')

        expect(await getReactErrorOverlayContent(browser)).toMatch(/Unterminated JSX contents/)

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the about page/
        )
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
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      let browser
      try {
        await renderViaHTTP('/hmr/about')

        aboutPage.replace('</div>', 'div')

        browser = await webdriver(context.appPort, '/hmr/contact')

        expect(await getReactErrorOverlayContent(browser)).toMatch(/Unterminated JSX contents/)

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
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser
          .elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('export', 'aa=20;\nexport')

        expect(await getReactErrorOverlayContent(browser)).toMatch(/aa is not defined/)

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the about page/
        )
      } finally {
        aboutPage.restore()
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover from errors in the render function', async () => {
      let browser
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser.elementByCss('p').text()

        expect(text).toBe('This is the about page.')

        aboutPage.replace('return', 'throw new Error("an-expected-error");\nreturn')

        expect(await getReactErrorOverlayContent(browser)).toMatch(/an-expected-error/)

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the about page/
        )
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
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('export default', 'export default {};\nexport const fn =')

        await check(
          () => getBrowserBodyText(browser),
          /The default export is not a React Component/
        )

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the about page/
        )
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
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('export default', 'export default () => /search/;\nexport const fn =')

        await check(
          () => getBrowserBodyText(browser),
          /Objects are not valid as a React child/
        )

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the about page/
        )
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
      const aboutPage = new File(join(__dirname, '../', 'pages', 'hmr', 'about.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/about')
        const text = await browser.elementByCss('p').text()
        expect(text).toBe('This is the about page.')

        aboutPage.replace('export default', 'export default undefined;\nexport const fn =')

        await check(
          async () => {
            const txt = await getBrowserBodyText(browser)
            console.log(txt)
            return txt
          },
          /The default export is not a React Component/
        )

        aboutPage.restore()

        await check(
          () => getBrowserBodyText(browser),
          /This is the about page/
        )
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
      const erroredPage = new File(join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr')
        await browser.elementByCss('#error-in-gip-link').click()

        expect(await getReactErrorOverlayContent(browser)).toMatch(/an-expected-error-in-gip/)

        erroredPage.replace('throw error', 'return {}')

        await check(
          () => getBrowserBodyText(browser),
          /Hello/
        )

        erroredPage.restore()

        await check(
          async () => {
            await browser.refresh()
            const text = await browser.elementByCss('body').text()
            if (text.includes('Hello')) {
              await waitFor(2000)
              throw new Error('waiting')
            }
            return getReactErrorOverlayContent(browser)
          },
          /an-expected-error-in-gip/
        )
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
      const erroredPage = new File(join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js'))
      try {
        browser = await webdriver(context.appPort, '/hmr/error-in-gip')

        expect(await getReactErrorOverlayContent(browser)).toMatch(/an-expected-error-in-gip/)

        const erroredPage = new File(join(__dirname, '../', 'pages', 'hmr', 'error-in-gip.js'))
        erroredPage.replace('throw error', 'return {}')

        await check(
          () => getBrowserBodyText(browser),
          /Hello/
        )

        erroredPage.restore()

        await check(
          async () => {
            await browser.refresh()
            const text = await getBrowserBodyText(browser)
            if (text.includes('Hello')) {
              await waitFor(2000)
              throw new Error('waiting')
            }
            return getReactErrorOverlayContent(browser)
          },
          /an-expected-error-in-gip/
        )
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
