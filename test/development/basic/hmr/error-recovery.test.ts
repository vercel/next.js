import type { NextConfig } from 'next'
import { join } from 'path'
import {
  assertHasRedbox,
  assertNoRedbox,
  getBrowserBodyText,
  getRedboxHeader,
  getRedboxDescription,
  getRedboxSource,
  renderViaHTTP,
  retry,
  waitFor,
} from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'

describe.each([
  { basePath: '', assetPrefix: '' },
  { basePath: '', assetPrefix: '/asset-prefix' },
  { basePath: '/docs', assetPrefix: '' },
  { basePath: '/docs', assetPrefix: '/asset-prefix' },
])(
  'HMR - Error Recovery, nextConfig: %o',
  (nextConfig: Partial<NextConfig>) => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig,
      patchFileDelay: 500,
    })
    const { basePath } = nextConfig

    it('should recover from 404 after a page has been added', async () => {
      const newPage = join('pages', 'hmr', 'new-page.js')

      try {
        const browser = await next.browser(basePath + '/hmr/new-page')

        expect(await browser.elementByCss('body').text()).toMatch(
          /This page could not be found/
        )

        // Add the page
        await next.patchFile(
          newPage,
          'export default () => (<div id="new-page">the-new-page</div>)'
        )

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(/the-new-page/)
        })

        await next.deleteFile(newPage)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This page could not be found/
          )
        })

        expect(next.cliOutput).toContain('Compiled /_error')
      } catch (err) {
        await next.deleteFile(newPage)
        throw err
      }
    })

    it('should recover from 404 after a page has been added with dynamic segments', async () => {
      const newPage = join('pages', 'hmr', '[foo]', 'page.js')

      try {
        const browser = await next.browser(basePath + '/hmr/foo/page')

        expect(await browser.elementByCss('body').text()).toMatch(
          /This page could not be found/
        )

        // Add the page
        await next.patchFile(
          newPage,
          'export default () => (<div id="new-page">the-new-page</div>)'
        )

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(/the-new-page/)
        })

        await next.deleteFile(newPage)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This page could not be found/
          )
        })

        expect(next.cliOutput).toContain('Compiled /_error')
      } catch (err) {
        await next.deleteFile(newPage)
        throw err
      }
    })
    ;(process.env.TURBOPACK ? it.skip : it)(
      // this test fails frequently with turbopack
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
          await next.browser(basePath + '/does-not-exist')

          await retry(() => {
            // eslint-disable-next-line jest/no-standalone-expect
            expect(next.cliOutput).toMatch(/getInitialProps called/)
          })

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
      const browser = await next.browser(basePath + '/hmr/about2')
      const aboutPage = join('pages', 'hmr', 'about2.js')
      const aboutContent = await next.readFile(aboutPage)
      await retry(async () => {
        expect(await getBrowserBodyText(browser)).toMatch(
          /This is the about page/
        )
      })

      await next.patchFile(aboutPage, aboutContent.replace('</div>', 'div'))

      await assertHasRedbox(browser)
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
         "./pages/hmr/about2.js (7:1)
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
            "./pages/hmr/about2.js (7:1)
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
        const browser = await next.browser(basePath + '/hmr/contact')
        try {
          await renderViaHTTP(next.url, basePath + '/hmr/about2')

          await next.patchFile(aboutPage, aboutContent.replace('</div>', 'div'))

          // Ensure dev server has time to break:
          await new Promise((resolve) => setTimeout(resolve, 2000))

          await assertHasRedbox(browser)
          expect(await getRedboxSource(browser)).toMatch(/Unexpected eof/)

          await next.patchFile(aboutPage, aboutContent)

          await retry(async () => {
            expect(await getBrowserBodyText(browser)).toMatch(
              /This is the contact page/
            )
          })
        } catch (err) {
          await next.patchFile(aboutPage, aboutContent)
          if (browser) {
            await retry(async () => {
              expect(await getBrowserBodyText(browser)).toMatch(
                /This is the contact page/
              )
            })
          }

          throw err
        }
      })
    }

    it('should detect runtime errors on the module scope', async () => {
      const browser = await next.browser(basePath + '/hmr/about3')
      const aboutPage = join('pages', 'hmr', 'about3.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        await next.patchFile(
          aboutPage,
          aboutContent.replace('export', 'aa=20;\nexport')
        )

        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch(/aa is not defined/)

        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
      } finally {
        await next.patchFile(aboutPage, aboutContent)
      }
    })

    it('should recover from errors in the render function', async () => {
      const browser = await next.browser(basePath + '/hmr/about4')
      const aboutPage = join('pages', 'hmr', 'about4.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'return',
            'throw new Error("an-expected-error");\nreturn'
          )
        )

        await assertHasRedbox(browser)
        expect(await getRedboxSource(browser)).toMatch(/an-expected-error/)

        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        throw err
      }
    })

    it('should recover after exporting an invalid page', async () => {
      const browser = await next.browser(basePath + '/hmr/about5')
      const aboutPage = join('pages', 'hmr', 'about5.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default {};\nexport const fn ='
          )
        )

        await assertHasRedbox(browser)
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: The default export is not a React Component in page: "/hmr/about5""`
        )

        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        throw err
      }
    })

    it('should recover after a bad return from the render function', async () => {
      const browser = await next.browser(basePath + '/hmr/about6')
      const aboutPage = join('pages', 'hmr', 'about6.js')
      const aboutContent = await next.readFile(aboutPage)
      try {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default () => /search/;\nexport const fn ='
          )
        )

        await assertHasRedbox(browser)
        // TODO: Replace this when webpack 5 is the default
        expect(await getRedboxHeader(browser)).toMatch(
          `Objects are not valid as a React child (found: [object RegExp]). If you meant to render a collection of children, use an array instead.`
        )

        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        throw err
      }
    })

    it('should recover after undefined exported as default', async () => {
      const browser = await next.browser(basePath + '/hmr/about7')
      const aboutPage = join('pages', 'hmr', 'about7.js')

      const aboutContent = await next.readFile(aboutPage)
      try {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'export default undefined;\nexport const fn ='
          )
        )

        await assertHasRedbox(browser)
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: The default export is not a React Component in page: "/hmr/about7""`
        )

        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
        await assertNoRedbox(browser)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        throw err
      }
    })

    it('should recover after webpack parse error in an imported file', async () => {
      const browser = await next.browser(basePath + '/hmr/about8')
      const aboutPage = join('pages', 'hmr', 'about8.js')

      const aboutContent = await next.readFile(aboutPage)
      try {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'import "../../components/parse-error.xyz"\nexport default'
          )
        )

        await assertHasRedbox(browser)
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

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
        await assertNoRedbox(browser)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        throw err
      }
    })

    it('should recover after loader parse error in an imported file', async () => {
      const browser = await next.browser(basePath + '/hmr/about9')
      const aboutPage = join('pages', 'hmr', 'about9.js')

      const aboutContent = await next.readFile(aboutPage)
      try {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })

        await next.patchFile(
          aboutPage,
          aboutContent.replace(
            'export default',
            'import "../../components/parse-error.js"\nexport default'
          )
        )

        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch('Failed to compile')
        let redboxSource = await getRedboxSource(browser)

        redboxSource = redboxSource.replace(`${next.testDir}`, '.')
        if (process.env.TURBOPACK) {
          expect(next.normalizeTestDirContent(redboxSource))
            .toMatchInlineSnapshot(`
           "./components/parse-error.js (3:1)
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

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
        await assertNoRedbox(browser)
      } catch (err) {
        await next.patchFile(aboutPage, aboutContent)

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(
            /This is the about page/
          )
        })
      }
    })

    it('should recover from errors in getInitialProps in client', async () => {
      const browser = await next.browser(basePath + '/hmr')
      const erroredPage = join('pages', 'hmr', 'error-in-gip.js')
      const errorContent = await next.readFile(erroredPage)
      try {
        await browser.elementByCss('#error-in-gip-link').click()

        await assertHasRedbox(browser)
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: an-expected-error-in-gip"`
        )

        await next.patchFile(
          erroredPage,
          errorContent.replace('throw error', 'return {}')
        )

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(/Hello/)
        })

        await next.patchFile(erroredPage, errorContent)

        await retry(async () => {
          await browser.refresh()
          await waitFor(2000)
          const text = await getBrowserBodyText(browser)
          if (text.includes('Hello')) {
            throw new Error('waiting')
          }
          return expect(await getRedboxSource(browser)).toMatch(
            /an-expected-error-in-gip/
          )
        })
      } catch (err) {
        await next.patchFile(erroredPage, errorContent)

        throw err
      }
    })

    it('should recover after an error reported via SSR', async () => {
      const browser = await next.browser(basePath + '/hmr/error-in-gip')
      const erroredPage = join('pages', 'hmr', 'error-in-gip.js')
      const errorContent = await next.readFile(erroredPage)
      try {
        await assertHasRedbox(browser)
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"Error: an-expected-error-in-gip"`
        )

        const erroredPage = join('pages', 'hmr', 'error-in-gip.js')

        await next.patchFile(
          erroredPage,
          errorContent.replace('throw error', 'return {}')
        )

        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(/Hello/)
        })

        await next.patchFile(erroredPage, errorContent)

        await retry(async () => {
          await browser.refresh()
          await waitFor(2000)
          const text = await getBrowserBodyText(browser)
          if (text.includes('Hello')) {
            throw new Error('waiting')
          }
          return expect(await getRedboxSource(browser)).toMatch(
            /an-expected-error-in-gip/
          )
        })
      } catch (err) {
        await next.patchFile(erroredPage, errorContent)

        throw err
      }
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
  }
)
