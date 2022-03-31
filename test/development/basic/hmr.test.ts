import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  check,
  getBrowserBodyText,
  getRedboxHeader,
  getRedboxSource,
  hasRedbox,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('basic HMR', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'hmr/pages')),
        components: new FileRef(join(__dirname, 'hmr/components')),
      },
    })
  })
  afterAll(() => next.destroy())

  it('should have correct router.isReady for auto-export page', async () => {
    let browser = await webdriver(next.url, '/auto-export-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await webdriver(next.url, '/auto-export-is-ready?hello=world')

    await check(async () => {
      return browser.elementByCss('#ready').text()
    }, 'yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hello: 'world',
    })
  })

  it('should have correct router.isReady for getStaticProps page', async () => {
    let browser = await webdriver(next.url, '/gsp-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await webdriver(next.url, '/gsp-is-ready?hello=world')

    await check(async () => {
      return browser.elementByCss('#ready').text()
    }, 'yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hello: 'world',
    })
  })

  describe('Hot Module Reloading', () => {
    describe('delete a page and add it back', () => {
      it('should load the page properly', async () => {
        const contactPagePath = join('pages', 'hmr', 'contact.js')
        const newContactPagePath = join('pages', 'hmr', '_contact.js')
        let browser
        try {
          const start = next.cliOutput.length
          browser = await webdriver(next.appPort, '/hmr/contact')
          const text = await browser.elementByCss('p').text()
          expect(text).toBe('This is the contact page.')

          // Rename the file to mimic a deleted page
          await next.renameFile(contactPagePath, newContactPagePath)

          await check(
            () => getBrowserBodyText(browser),
            /This page could not be found/
          )

          // Rename the file back to the original filename
          await next.renameFile(newContactPagePath, contactPagePath)

          // wait until the page comes back
          await check(
            () => getBrowserBodyText(browser),
            /This is the contact page/
          )

          expect(next.cliOutput.slice(start)).toContain('compiling...')
          expect(next.cliOutput.slice(start)).toContain(
            'compiling /hmr/contact (client and server)...'
          )
          expect(next.cliOutput).toContain(
            'compiling /_error (client and server)...'
          )
        } finally {
          if (browser) {
            await browser.close()
          }
          await next
            .renameFile(newContactPagePath, contactPagePath)
            .catch(() => {})
        }
      })
    })

    describe('editing a page', () => {
      it('should detect the changes and display it', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/hmr/about')
          const text = await browser.elementByCss('p').text()
          expect(text).toBe('This is the about page.')

          const aboutPagePath = join('pages', 'hmr', 'about.js')

          const originalContent = await next.readFile(aboutPagePath)
          const editedContent = originalContent.replace(
            'This is the about page',
            'COOL page'
          )

          // change the content
          try {
            await next.patchFile(aboutPagePath, editedContent)
            await check(() => getBrowserBodyText(browser), /COOL page/)
          } finally {
            // add the original content
            await next.patchFile(aboutPagePath, originalContent)
          }

          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should not reload unrelated pages', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/hmr/counter')
          const text = await browser
            .elementByCss('button')
            .click()
            .elementByCss('button')
            .click()
            .elementByCss('p')
            .text()
          expect(text).toBe('COUNT: 2')

          const aboutPagePath = join('pages', 'hmr', 'about.js')

          const originalContent = await next.readFile(aboutPagePath)
          const editedContent = originalContent.replace(
            'This is the about page',
            'COOL page'
          )

          try {
            // Change the about.js page
            await next.patchFile(aboutPagePath, editedContent)

            // Check whether the this page has reloaded or not.
            await check(() => browser.elementByCss('p').text(), /COUNT: 2/)
          } finally {
            // restore the about page content.
            await next.patchFile(aboutPagePath, originalContent)
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/vercel/styled-jsx/issues/425
      it('should update styles correctly', async () => {
        let browser
        try {
          browser = await webdriver(next.appPort, '/hmr/style')
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const pagePath = join('pages', 'hmr', 'style.js')

          const originalContent = await next.readFile(pagePath)
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          await next.patchFile(pagePath, editedContent)

          try {
            // Check whether the this page has reloaded or not.
            await check(async () => {
              const editedPTag = await browser.elementByCss('.hmr-style-page p')
              return editedPTag.getComputedCss('font-size')
            }, /200px/)
          } finally {
            // Finally is used so that we revert the content back to the original regardless of the test outcome
            // restore the about page content.
            await next.patchFile(pagePath, originalContent)
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/vercel/styled-jsx/issues/425
      it('should update styles in a stateful component correctly', async () => {
        let browser
        const pagePath = join('pages', 'hmr', 'style-stateful-component.js')
        const originalContent = await next.readFile(pagePath)
        try {
          browser = await webdriver(
            next.appPort,
            '/hmr/style-stateful-component'
          )
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          await next.patchFile(pagePath, editedContent)

          // Check whether the this page has reloaded or not.
          await check(async () => {
            const editedPTag = await browser.elementByCss('.hmr-style-page p')
            return editedPTag.getComputedCss('font-size')
          }, /200px/)
        } finally {
          if (browser) {
            await browser.close()
          }
          await next.patchFile(pagePath, originalContent)
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/vercel/styled-jsx/issues/425
      it('should update styles in a dynamic component correctly', async () => {
        let browser = null
        let secondBrowser = null
        const pagePath = join('components', 'hmr', 'dynamic.js')
        const originalContent = await next.readFile(pagePath)
        try {
          browser = await webdriver(
            next.appPort,
            '/hmr/style-dynamic-component'
          )
          const div = await browser.elementByCss('#dynamic-component')
          const initialClientClassName = await div.getAttribute('class')
          const initialFontSize = await div.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const initialHtml = await renderViaHTTP(
            next.appPort,
            '/hmr/style-dynamic-component'
          )
          expect(initialHtml.includes('100px')).toBeTruthy()

          const $initialHtml = cheerio.load(initialHtml)
          const initialServerClassName =
            $initialHtml('#dynamic-component').attr('class')

          expect(initialClientClassName === initialServerClassName).toBeTruthy()

          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          await next.patchFile(pagePath, editedContent)

          // wait for 5 seconds
          await waitFor(5000)

          secondBrowser = await webdriver(
            next.appPort,
            '/hmr/style-dynamic-component'
          )
          // Check whether the this page has reloaded or not.
          const editedDiv = await secondBrowser.elementByCss(
            '#dynamic-component'
          )
          const editedClientClassName = await editedDiv.getAttribute('class')
          const editedFontSize = await editedDiv.getComputedCss('font-size')
          const browserHtml = await secondBrowser.eval(
            'document.documentElement.innerHTML'
          )

          expect(editedFontSize).toBe('200px')
          expect(browserHtml.includes('font-size:200px')).toBe(true)
          expect(browserHtml.includes('font-size:100px')).toBe(false)

          const editedHtml = await renderViaHTTP(
            next.appPort,
            '/hmr/style-dynamic-component'
          )
          expect(editedHtml.includes('200px')).toBeTruthy()
          const $editedHtml = cheerio.load(editedHtml)
          const editedServerClassName =
            $editedHtml('#dynamic-component').attr('class')

          expect(editedClientClassName === editedServerClassName).toBe(true)
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          await next.patchFile(pagePath, originalContent)

          if (browser) {
            await browser.close()
          }

          if (secondBrowser) {
            secondBrowser.close()
          }
        }
      })
    })
  })

  describe('Error Recovery', () => {
    it('should recover from 404 after a page has been added', async () => {
      let browser
      const newPage = join('pages', 'hmr', 'new-page.js')

      try {
        const start = next.cliOutput.length
        browser = await webdriver(next.appPort, '/hmr/new-page')

        expect(await browser.elementByCss('body').text()).toMatch(
          /This page could not be found/
        )

        // Add the page
        await next.patchFile(
          newPage,
          'export default () => (<div id="new-page">the-new-page</div>)'
        )

        await check(() => getBrowserBodyText(browser), /the-new-page/)

        await next.deleteFile(newPage)

        await check(
          () => getBrowserBodyText(browser),
          /This page could not be found/
        )

        expect(next.cliOutput.slice(start)).toContain(
          'compiling /hmr/new-page (client and server)...'
        )
        expect(next.cliOutput).toContain(
          'compiling /_error (client and server)...'
        )
      } catch (err) {
        await next.deleteFile(newPage)
        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should detect syntax errors and recover', async () => {
      let browser
      const aboutPage = join('pages', 'hmr', 'about2.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        const start = next.cliOutput.length
        browser = await webdriver(next.appPort, '/hmr/about2')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(aboutPage, aboutContent.replace('</div>', 'div'))

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxSource(browser)).toMatch(/Unexpected eof/)

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
        expect(next.cliOutput.slice(start)).toContain(
          'compiling /hmr/about2 (client and server)...'
        )
        expect(next.cliOutput).toContain(
          'compiling /_error (client and server)...'
        )
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)
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
      const aboutPage = join('pages', 'hmr', 'about2.js')
      const aboutContent = await next.readFile(aboutPage)
      let browser
      try {
        await renderViaHTTP(next.appPort, '/hmr/about2')

        await next.patchFile(aboutPage, aboutContent.replace('</div>', 'div'))

        // Ensure dev server has time to break:
        await new Promise((resolve) => setTimeout(resolve, 2000))

        browser = await webdriver(next.appPort, '/hmr/contact')

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxSource(browser)).toMatch(/Unexpected eof/)

        await next.patchFile(aboutPage, aboutContent)

        await check(
          () => getBrowserBodyText(browser),
          /This is the contact page/
        )
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)
        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the contact page/
          )
        }

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should detect runtime errors on the module scope', async () => {
      let browser
      const aboutPage = join('pages', 'hmr', 'about3.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.appPort, '/hmr/about3')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace('export', 'aa=20;\nexport')
        )

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatch(/aa is not defined/)

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } finally {
        await next.patchFile(aboutPage, aboutContent)
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover from errors in the render function', async () => {
      let browser
      const aboutPage = join('pages', 'hmr', 'about4.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.appPort, '/hmr/about4')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'return',
            'throw new Error("an-expected-error");\nreturn'
          )
        )

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxSource(browser)).toMatch(/an-expected-error/)

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)
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
      const aboutPage = join('pages', 'hmr', 'about5.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.appPort, '/hmr/about5')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default {};\nexport const fn ='
          )
        )

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Server Error

          Error: The default export is not a React Component in page: \\"/hmr/about5\\"

          This error happened while generating the page. Any console logs will be displayed in the terminal window."
        `)

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

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
      const aboutPage = join('pages', 'hmr', 'about6.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.appPort, '/hmr/about6')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default () => /search/;\nexport const fn ='
          )
        )

        const isReact17 = process.env.NEXT_TEST_REACT_VERSION === '^17'

        expect(await hasRedbox(browser)).toBe(true)
        // TODO: Replace this when webpack 5 is the default
        expect(
          (await getRedboxHeader(browser)).replace(
            '__WEBPACK_DEFAULT_EXPORT__',
            'Unknown'
          )
        ).toMatch(
          `Objects are not valid as a React child (found: ${
            isReact17 ? '/search/' : '[object RegExp]'
          }). If you meant to render a collection of children, use an array instead.`
        )

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

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
      const aboutPage = join('pages', 'hmr', 'about7.js')

      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.appPort, '/hmr/about7')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default undefined;\nexport const fn ='
          )
        )

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Server Error

          Error: The default export is not a React Component in page: \\"/hmr/about7\\"

          This error happened while generating the page. Any console logs will be displayed in the terminal window."
        `)

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
        expect(await hasRedbox(browser, false)).toBe(false)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

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
      const erroredPage = join('pages', 'hmr', 'error-in-gip.js')
      const errorContent = await next.readFile(erroredPage)
      try {
        browser = await webdriver(next.appPort, '/hmr')
        await browser.elementByCss('#error-in-gip-link').click()

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Unhandled Runtime Error

          Error: an-expected-error-in-gip"
        `)

        await next.patchFile(
          erroredPage,
          errorContent.replace('throw error', 'return {}')
        )

        await check(() => getBrowserBodyText(browser), /Hello/)

        await next.patchFile(erroredPage, errorContent)

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
        await next.patchFile(erroredPage, errorContent)

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover after an error reported via SSR', async () => {
      let browser
      const erroredPage = join('pages', 'hmr', 'error-in-gip.js')
      const errorContent = await next.readFile(erroredPage)
      try {
        browser = await webdriver(next.appPort, '/hmr/error-in-gip')

        expect(await hasRedbox(browser)).toBe(true)
        expect(await getRedboxHeader(browser)).toMatchInlineSnapshot(`
          " 1 of 1 unhandled error
          Server Error

          Error: an-expected-error-in-gip

          This error happened while generating the page. Any console logs will be displayed in the terminal window."
        `)

        const erroredPage = join('pages', 'hmr', 'error-in-gip.js')

        await next.patchFile(
          erroredPage,
          errorContent.replace('throw error', 'return {}')
        )

        await check(() => getBrowserBodyText(browser), /Hello/)

        await next.patchFile(erroredPage, errorContent)

        await check(async () => {
          await browser.refresh()
          const text = await getBrowserBodyText(browser)
          if (text.includes('Hello')) {
            await waitFor(2000)
            throw new Error('waiting')
          }

          await waitFor(2000)
          const source = await getRedboxSource(browser)
          return source
        }, /an-expected-error-in-gip/)
      } catch (err) {
        await next.patchFile(erroredPage, errorContent)

        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
})
