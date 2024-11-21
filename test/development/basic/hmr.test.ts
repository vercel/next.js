import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  assertHasRedbox,
  assertNoRedbox,
  check,
  getBrowserBodyText,
  getRedboxHeader,
  getRedboxDescription,
  getRedboxSource,
  renderViaHTTP,
  retry,
  waitFor,
} from 'next-test-utils'
import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { outdent } from 'outdent'
import type { NextConfig } from 'next'

describe.each([
  { basePath: '', assetPrefix: '' },
  { basePath: '', assetPrefix: '/asset-prefix' },
  { basePath: '/docs', assetPrefix: '' },
  { basePath: '/docs', assetPrefix: '/asset-prefix' },
])('basic HMR, nextConfig: %o', (nextConfig: Partial<NextConfig>) => {
  const { basePath } = nextConfig
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: join(__dirname, 'hmr'),
      nextConfig,
      patchFileDelay: 500,
    })
  })
  afterAll(() => next.destroy())

  it('should have correct router.isReady for auto-export page', async () => {
    let browser = await webdriver(next.url, basePath + '/auto-export-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await webdriver(
      next.url,
      basePath + '/auto-export-is-ready?hello=world'
    )

    await check(async () => {
      return browser.elementByCss('#ready').text()
    }, 'yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({
      hello: 'world',
    })
  })

  it('should have correct router.isReady for getStaticProps page', async () => {
    let browser = await webdriver(next.url, basePath + '/gsp-is-ready')

    expect(await browser.elementByCss('#ready').text()).toBe('yes')
    expect(JSON.parse(await browser.elementByCss('#query').text())).toEqual({})

    browser = await webdriver(next.url, basePath + '/gsp-is-ready?hello=world')

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
          browser = await webdriver(next.url, basePath + '/hmr/contact')
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

          expect(next.cliOutput).toContain('Compiled /_error')
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
          browser = await webdriver(next.url, basePath + '/hmr/about')
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
          browser = await webdriver(next.url, basePath + '/hmr/counter')
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
          browser = await webdriver(next.url, basePath + '/hmr/style')
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
            next.url,
            basePath + '/hmr/style-stateful-component'
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
            next.url,
            basePath + '/hmr/style-dynamic-component'
          )
          const div = await browser.elementByCss('#dynamic-component')
          const initialClientClassName = await div.getAttribute('class')
          const initialFontSize = await div.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const initialHtml = await renderViaHTTP(
            next.url,
            basePath + '/hmr/style-dynamic-component'
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
            next.url,
            basePath + '/hmr/style-dynamic-component'
          )
          // Check whether the this page has reloaded or not.
          const editedDiv =
            await secondBrowser.elementByCss('#dynamic-component')
          const editedClientClassName = await editedDiv.getAttribute('class')
          const editedFontSize = await editedDiv.getComputedCss('font-size')
          const browserHtml = await secondBrowser.eval(
            'document.documentElement.innerHTML'
          )

          expect(editedFontSize).toBe('200px')
          expect(browserHtml.includes('font-size:200px')).toBe(true)
          expect(browserHtml.includes('font-size:100px')).toBe(false)

          const editedHtml = await renderViaHTTP(
            next.url,
            basePath + '/hmr/style-dynamic-component'
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

      it('should not full reload when nonlatin characters are used', async () => {
        let browser = null
        const pagePath = join('pages', 'hmr', 'nonlatin.js')
        const originalContent = await next.readFile(pagePath)
        try {
          browser = await webdriver(next.url, basePath + '/hmr/nonlatin')
          const timeOrigin = await browser.eval('performance.timeOrigin')
          const editedContent = originalContent.replace(
            '<div>テスト</div>',
            '<div class="updated">テスト</div>'
          )

          // Change the page
          await next.patchFile(pagePath, editedContent)

          await browser.waitForElementByCss('.updated')

          expect(await browser.eval('performance.timeOrigin')).toEqual(
            timeOrigin
          )
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          await next.patchFile(pagePath, originalContent)

          if (browser) {
            await browser.close()
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
        browser = await webdriver(next.url, basePath + '/hmr/new-page')

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

        expect(next.cliOutput).toContain('Compiled /_error')
      } catch (err) {
        await next.deleteFile(newPage)
        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    it('should recover from 404 after a page has been added with dynamic segments', async () => {
      let browser
      const newPage = join('pages', 'hmr', '[foo]', 'page.js')

      try {
        browser = await webdriver(next.url, basePath + '/hmr/foo/page')

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

        expect(next.cliOutput).toContain('Compiled /_error')
      } catch (err) {
        await next.deleteFile(newPage)
        throw err
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })

    // this test fails frequently with turbopack
    ;(process.env.TURBOPACK ? it.skip : it)(
      'should not continously poll a custom error page',
      async () => {
        const errorPage = join('pages', '_error.js')

        await next.patchFile(
          errorPage,
          outdent`
          function Error({ statusCode, message, count }) {
            return (
              <div>
                Error Message: {message}
              </div>
            )
          }

          Error.getInitialProps = async ({ res, err }) => {
            const statusCode = res ? res.statusCode : err ? err.statusCode : 404
            console.log('getInitialProps called');
            return {
              statusCode,
              message: err ? err.message : 'Oops...',
            }
          }

          export default Error
        `
        )

        try {
          // navigate to a 404 page
          await webdriver(next.url, basePath + '/does-not-exist')

          await check(() => next.cliOutput, /getInitialProps called/)

          const outputIndex = next.cliOutput.length

          // wait a few seconds to ensure polling didn't happen
          await waitFor(3000)

          const logOccurrences =
            next.cliOutput.slice(outputIndex).split('getInitialProps called')
              .length - 1
          // eslint-disable-next-line jest/no-standalone-expect
          expect(logOccurrences).toBe(0)
        } finally {
          await next.deleteFile(errorPage)
        }
      }
    )

    it('should detect syntax errors and recover', async () => {
      const browser = await webdriver(next.url, basePath + '/hmr/about2')
      const aboutPage = join('pages', 'hmr', 'about2.js')
      const aboutContent = await next.readFile(aboutPage)
      await retry(async () => {
        expect(await getBrowserBodyText(browser)).toMatch(
          /This is the about page/
        )
      })

      await next.patchFile(aboutPage, aboutContent.replace('</div>', 'div'))

      await assertHasRedbox(browser, { pageResponseCode: 500 })
      const source = next.normalizeTestDirContent(
        await getRedboxSource(browser)
      )
      if (basePath === '' && !process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
          "./pages/hmr/about2.js
          Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
             ,-[7:1]
           4 |       <p>This is the about page.</p>
           5 |     div
           6 |   )
           7 | }
             : ^
             \`----
            x Unexpected eof
             ,-[7:3]
           5 |     div
           6 |   )
           7 | }
             \`----

          Caused by:
              Syntax Error

          Import trace for requested module:
          ./pages/hmr/about2.js"
        `)
      } else if (basePath === '' && process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
            "./pages/hmr/about2.js:7:1
            Parsing ecmascript source code failed
              5 |     div
              6 |   )
            > 7 | }
                | ^
              8 |

            Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?"
          `)
      } else if (basePath === '/docs' && !process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
          "./pages/hmr/about2.js
          Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
             ,-[7:1]
           4 |       <p>This is the about page.</p>
           5 |     div
           6 |   )
           7 | }
             : ^
             \`----
            x Unexpected eof
             ,-[7:3]
           5 |     div
           6 |   )
           7 | }
             \`----

          Caused by:
              Syntax Error

          Import trace for requested module:
          ./pages/hmr/about2.js"
        `)
      } else if (basePath === '/docs' && process.env.TURBOPACK) {
        expect(source).toMatchInlineSnapshot(`
            "./pages/hmr/about2.js:7:1
            Parsing ecmascript source code failed
              5 |     div
              6 |   )
            > 7 | }
                | ^
              8 |

            Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?"
          `)
      }

      await next.patchFile(aboutPage, aboutContent)

      await retry(async () => {
        expect(await getBrowserBodyText(browser)).toMatch(
          /This is the about page/
        )
      })
    })

    if (!process.env.TURBOPACK) {
      // Turbopack doesn't have this restriction
      it('should show the error on all pages', async () => {
        const aboutPage = join('pages', 'hmr', 'about2.js')
        const aboutContent = await next.readFile(aboutPage)
        let browser
        try {
          await renderViaHTTP(next.url, basePath + '/hmr/about2')

          await next.patchFile(aboutPage, aboutContent.replace('</div>', 'div'))

          // Ensure dev server has time to break:
          await new Promise((resolve) => setTimeout(resolve, 2000))

          browser = await webdriver(next.url, basePath + '/hmr/contact')

          await assertHasRedbox(browser, { pageResponseCode: 500 })
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
    }

    it('should detect runtime errors on the module scope', async () => {
      let browser
      const aboutPage = join('pages', 'hmr', 'about3.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.url, basePath + '/hmr/about3')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace('export', 'aa=20;\nexport')
        )

        await assertHasRedbox(browser, { pageResponseCode: 500 })
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
        browser = await webdriver(next.url, basePath + '/hmr/about4')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'return',
            'throw new Error("an-expected-error");\nreturn'
          )
        )

        await assertHasRedbox(browser, { pageResponseCode: 500 })
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
        browser = await webdriver(next.url, basePath + '/hmr/about5')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default {};\nexport const fn ='
          )
        )

        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: The default export is not a React Component in page: "/hmr/about5""`
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

    it('should recover after a bad return from the render function', async () => {
      let browser
      const aboutPage = join('pages', 'hmr', 'about6.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.url, basePath + '/hmr/about6')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default () => /search/;\nexport const fn ='
          )
        )

        await assertHasRedbox(browser, { pageResponseCode: 500 })
        // TODO: Replace this when webpack 5 is the default
        expect(await getRedboxHeader(browser)).toMatch(
          `Objects are not valid as a React child (found: [object RegExp]). If you meant to render a collection of children, use an array instead.`
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
        browser = await webdriver(next.url, basePath + '/hmr/about7')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default undefined;\nexport const fn ='
          )
        )

        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: The default export is not a React Component in page: "/hmr/about7""`
        )

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
        await assertNoRedbox(browser)
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

    it('should recover after webpack parse error in an imported file', async () => {
      let browser
      const aboutPage = join('pages', 'hmr', 'about8.js')

      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.appPort, basePath + '/hmr/about8')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'import "../../components/parse-error.xyz"\nexport default'
          )
        )

        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxHeader(browser)).toMatch('Failed to compile')

        if (process.env.TURBOPACK) {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
              "./components/parse-error.xyz
              Unknown module type
              This module doesn't have an associated type. Use a known file extension, or register a loader for it.

              Read more: https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders"
            `)
        } else {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
                      "./components/parse-error.xyz
                      Module parse failed: Unexpected token (3:0)
                      You may need an appropriate loader to handle this file type, currently no loaders are configured to process this file. See https://webpack.js.org/concepts#loaders
                      | This
                      | is
                      > }}}
                      | invalid
                      | js

                      Import trace for requested module:
                      ./components/parse-error.xyz
                      ./pages/hmr/about8.js"
                  `)
        }
        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
        await assertNoRedbox(browser)
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

    it('should recover after loader parse error in an imported file', async () => {
      let browser
      const aboutPage = join('pages', 'hmr', 'about9.js')

      const aboutContent = await next.readFile(aboutPage)
      try {
        browser = await webdriver(next.appPort, basePath + '/hmr/about9')
        await check(() => getBrowserBodyText(browser), /This is the about page/)

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'import "../../components/parse-error.js"\nexport default'
          )
        )

        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxHeader(browser)).toMatch('Failed to compile')
        let redboxSource = await getRedboxSource(browser)

        redboxSource = redboxSource.replace(`${next.testDir}`, '.')
        if (process.env.TURBOPACK) {
          expect(next.normalizeTestDirContent(redboxSource))
            .toMatchInlineSnapshot(`
              "./components/parse-error.js:3:1
              Parsing ecmascript source code failed
                1 | This
                2 | is
              > 3 | }}}
                  | ^
                4 | invalid
                5 | js

              Expression expected"
            `)
        } else {
          redboxSource = redboxSource.substring(
            0,
            redboxSource.indexOf('`----')
          )

          expect(next.normalizeTestDirContent(redboxSource))
            .toMatchInlineSnapshot(`
            "./components/parse-error.js
            Error:   x Expression expected
               ,-[3:1]
             1 | This
             2 | is
             3 | }}}
               : ^
             4 | invalid
             5 | js
               "
          `)
        }

        await next.patchFile(aboutPage, aboutContent)

        await check(() => getBrowserBodyText(browser), /This is the about page/)
        await assertNoRedbox(browser)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

        if (browser) {
          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        }
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
        browser = await webdriver(next.url, basePath + '/hmr')
        await browser.elementByCss('#error-in-gip-link').click()

        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: an-expected-error-in-gip"`
        )

        await next.patchFile(
          erroredPage,
          errorContent.replace('throw error', 'return {}')
        )

        await check(() => getBrowserBodyText(browser), /Hello/)

        await next.patchFile(erroredPage, errorContent)

        await check(async () => {
          await browser.refresh()
          await waitFor(2000)
          const text = await getBrowserBodyText(browser)
          if (text.includes('Hello')) {
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
        browser = await webdriver(next.url, basePath + '/hmr/error-in-gip')

        await assertHasRedbox(browser, { pageResponseCode: 500 })
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: an-expected-error-in-gip"`
        )

        const erroredPage = join('pages', 'hmr', 'error-in-gip.js')

        await next.patchFile(
          erroredPage,
          errorContent.replace('throw error', 'return {}')
        )

        await check(() => getBrowserBodyText(browser), /Hello/)

        await next.patchFile(erroredPage, errorContent)

        await check(async () => {
          await browser.refresh()
          await waitFor(2000)
          const text = await getBrowserBodyText(browser)
          if (text.includes('Hello')) {
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
  })

  describe('Full reload', () => {
    it('should warn about full reload in cli output - anonymous page function', async () => {
      const start = next.cliOutput.length
      const browser = await webdriver(
        next.url,
        basePath + '/hmr/anonymous-page-function'
      )
      const cliWarning =
        'Fast Refresh had to perform a full reload when ./pages/hmr/anonymous-page-function.js changed. Read more: https://nextjs.org/docs/messages/fast-refresh-reload'

      expect(await browser.elementByCss('p').text()).toBe('hello world')
      expect(next.cliOutput.slice(start)).not.toContain(cliWarning)

      const currentFileContent = await next.readFile(
        './pages/hmr/anonymous-page-function.js'
      )
      const newFileContent = currentFileContent.replace(
        '<p>hello world</p>',
        '<p id="updated">hello world!!!</p>'
      )
      await next.patchFile(
        './pages/hmr/anonymous-page-function.js',
        newFileContent
      )

      expect(await browser.waitForElementByCss('#updated').text()).toBe(
        'hello world!!!'
      )

      // CLI warning
      expect(next.cliOutput.slice(start)).toContain(cliWarning)

      // Browser warning
      const browserLogs = await browser.log()
      expect(
        browserLogs.some(({ message }) =>
          message.includes(
            "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree."
          )
        )
      ).toBeTruthy()
    })

    it('should warn about full reload in cli output - runtime-error', async () => {
      const start = next.cliOutput.length
      const browser = await webdriver(next.url, basePath + '/hmr/runtime-error')
      const cliWarning =
        'Fast Refresh had to perform a full reload due to a runtime error.'

      await check(
        () => getRedboxHeader(browser),
        /ReferenceError: whoops is not defined/
      )
      expect(next.cliOutput.slice(start)).not.toContain(cliWarning)

      const currentFileContent = await next.readFile(
        './pages/hmr/runtime-error.js'
      )
      const newFileContent = currentFileContent.replace(
        'whoops',
        '<p id="updated">whoops</p>'
      )
      await next.patchFile('./pages/hmr/runtime-error.js', newFileContent)

      expect(await browser.waitForElementByCss('#updated').text()).toBe(
        'whoops'
      )

      // CLI warning
      expect(next.cliOutput.slice(start)).toContain(cliWarning)

      // Browser warning
      const browserLogs = await browser.log()
      expect(
        browserLogs.some(({ message }) =>
          message.includes(
            '[Fast Refresh] performing full reload because your application had an unrecoverable error'
          )
        )
      ).toBeTruthy()
    })
  })

  if (!process.env.TURBOPACK) {
    it('should have client HMR events in trace file', async () => {
      const traceData = await next.readFile('.next/trace')
      expect(traceData).toContain('client-hmr-latency')
      expect(traceData).toContain('client-error')
      expect(traceData).toContain('client-success')
      expect(traceData).toContain('client-full-reload')
    })
  }

  it('should have correct compile timing after fixing error', async () => {
    const pageName = 'pages/auto-export-is-ready.js'
    const originalContent = await next.readFile(pageName)

    try {
      const browser = await webdriver(
        next.url,
        basePath + '/auto-export-is-ready'
      )
      const outputLength = next.cliOutput.length
      await next.patchFile(
        pageName,
        `import hello from 'non-existent'\n` + originalContent
      )
      await assertHasRedbox(browser, { pageResponseCode: 500 })
      await waitFor(3000)
      await next.patchFile(pageName, originalContent)
      await check(() => next.cliOutput.substring(outputLength), /Compiled.*?/i)
      const compileTimeStr = next.cliOutput.substring(outputLength)

      const matches = [
        ...compileTimeStr.match(/Compiled.*? in ([\d.]{1,})\s?(?:s|ms)/i),
      ]
      const [, compileTime, timeUnit] = matches

      let compileTimeMs = parseFloat(compileTime)
      if (timeUnit === 's') {
        compileTimeMs = compileTimeMs * 1000
      }
      expect(compileTimeMs).toBeLessThan(3000)
    } finally {
      await next.patchFile(pageName, originalContent)
    }
  })

  it('should reload the page when the server restarts', async () => {
    const browser = await webdriver(next.url, basePath + '/hmr/about', {
      headless: false,
    })
    await check(() => getBrowserBodyText(browser), /This is the about page/)

    await next.destroy()

    let reloadPromise = new Promise((resolve) => {
      browser.on('request', (req) => {
        if (req.url().endsWith('/hmr/about')) {
          resolve(req.url())
        }
      })
    })

    next = await createNext({
      files: join(__dirname, 'hmr'),
      nextConfig,
      forcedPort: next.appPort,
    })

    await reloadPromise
  })
})
