import { join } from 'path'
import {
  assertHasRedbox,
  assertNoRedbox,
  getBrowserBodyText,
  getRedboxHeader,
  getRedboxDescription,
  getRedboxSource,
  retry,
  waitFor,
  trimEndMultiline,
  getDistDir,
} from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import { outdent } from 'outdent'

export function runErrorRecoveryHmrTest(nextConfig: {
  basePath: string
  assetPrefix: string
}) {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig,
    patchFileDelay: 500,
  })
  const { basePath } = nextConfig

  it('should recover from 404 after a page has been added', async () => {
    const browser = await next.browser(basePath + '/hmr/new-page')

    expect(await browser.elementByCss('body').text()).toMatch(
      /This page could not be found/
    )

    expect(next.cliOutput).toContain('GET /hmr/new-page 404')
    let cliOutputLength = next.cliOutput.length

    // Add the page
    await next.patchFile(
      join('pages', 'hmr', 'new-page.js'),
      'export default () => (<div id="new-page">the-new-page</div>)',
      async () => {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(/the-new-page/)
        })
        expect(next.cliOutput.slice(cliOutputLength)).toContain(
          'GET /hmr/new-page 200'
        )
        cliOutputLength = next.cliOutput.length
      }
    )

    // page was deleted at the end of patchFile
    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This page could not be found/
      )
    })
    expect(next.cliOutput.slice(cliOutputLength)).toContain(
      'GET /hmr/new-page 404'
    )
  })

  it('should recover from 404 after a page has been added with dynamic segments', async () => {
    const browser = await next.browser(basePath + '/hmr/foo/page')

    expect(await browser.elementByCss('body').text()).toMatch(
      /This page could not be found/
    )

    expect(next.cliOutput).toContain('GET /hmr/foo/page 404')
    let cliOutputLength = next.cliOutput.length

    // Add the page
    await next.patchFile(
      join('pages', 'hmr', '[foo]', 'page.js'),
      'export default () => (<div id="new-page">the-new-page</div>)',
      async () => {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(/the-new-page/)
        })
        expect(next.cliOutput.slice(cliOutputLength)).toContain(
          'GET /hmr/foo/page 200'
        )
        cliOutputLength = next.cliOutput.length
      }
    )

    // page was deleted at the end of patchFile
    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This page could not be found/
      )
    })
    expect(next.cliOutput.slice(cliOutputLength)).toContain(
      'GET /hmr/foo/page 404'
    )
  })
  ;(process.env.IS_TURBOPACK_TEST ? it.skip : it)(
    // this test fails frequently with turbopack
    'should not continously poll a custom error page',
    async () => {
      await next.patchFile(
        join('pages', '_error.js'),
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
        `,
        async () => {
          // navigate to a 404 page
          await next.browser(basePath + '/does-not-exist')

          await retry(() => {
            expect(next.cliOutput).toMatch(/getInitialProps called/)
          })

          const outputIndex = next.cliOutput.length

          // wait a few seconds to ensure polling didn't happen
          await waitFor(3000)

          const logOccurrences =
            next.cliOutput.slice(outputIndex).split('getInitialProps called')
              .length - 1
          expect(logOccurrences).toBe(0)
        }
      )
    }
  )

  it('should detect syntax errors and recover', async () => {
    const browser = await next.browser(basePath + '/hmr/about2')
    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.patchFile(
      join('pages', 'hmr', 'about2.js'),
      (content) => content.replace('</div>', 'div'),
      async () => {
        await assertHasRedbox(browser)
        const source = next.normalizeTestDirContent(
          await getRedboxSource(browser)
        )

        if (process.env.IS_TURBOPACK_TEST) {
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
        } else if (process.env.NEXT_RSPACK) {
          expect(trimEndMultiline(source)).toMatchInlineSnapshot(`
       "./pages/hmr/about2.js
         × Module build failed:
         ╰─▶   × Error:   x Unexpected token. Did you mean \`{'}'}\` or \`&rbrace;\`?
               │    ,-[7:1]
               │  4 |       <p>This is the about page.</p>
               │  5 |     div
               │  6 |   )
               │  7 | }
               │    : ^
               │    \`----
               │   x Expected '</', got '<eof>'
               │    ,-[7:3]
               │  5 |     div
               │  6 |   )
               │  7 | }
               │    \`----
               │
               │
               │ Caused by:
               │     Syntax Error

       Import trace for requested module:
       ./pages/hmr/about2.js"
      `)
        } else {
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
            x Expected '</', got '<eof>'
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
        }
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
  })

  if (!process.env.IS_TURBOPACK_TEST) {
    // Turbopack doesn't have this restriction
    it('should show the error on all pages', async () => {
      const browser = await next.browser(basePath + '/hmr/contact')
      await next.render(basePath + '/hmr/about2')

      await next.patchFile(
        join('pages', 'hmr', 'about2.js'),
        (content) => content.replace('</div>', 'div'),
        async () => {
          // Ensure dev server has time to break:
          await new Promise((resolve) => setTimeout(resolve, 2000))

          await assertHasRedbox(browser)
          expect(await getRedboxSource(browser)).toContain(
            "Expected '</', got '<eof>'"
          )
        }
      )

      await retry(async () => {
        expect(await getBrowserBodyText(browser)).toMatch(
          /This is the contact page/
        )
      })
    })
  }

  it('should detect runtime errors on the module scope', async () => {
    const browser = await next.browser(basePath + '/hmr/about3')

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.patchFile(
      join('pages', 'hmr', 'about3.js'),
      (content) => content.replace('export', 'aa=20;\nexport'),
      async () => {
        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch(/aa is not defined/)
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
  })

  it('should recover from errors in the render function', async () => {
    const browser = await next.browser(basePath + '/hmr/about4')

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.patchFile(
      join('pages', 'hmr', 'about4.js'),
      (content) =>
        content.replace(
          'return',
          'throw new Error("an-expected-error");\nreturn'
        ),
      async () => {
        await assertHasRedbox(browser)
        expect(await getRedboxSource(browser)).toMatch(/an-expected-error/)
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
  })

  it('should recover after exporting an invalid page', async () => {
    const browser = await next.browser(basePath + '/hmr/about5')

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.patchFile(
      join('pages', 'hmr', 'about5.js'),
      (content) =>
        content.replace(
          'export default',
          'export default {};\nexport const fn ='
        ),
      async () => {
        await assertHasRedbox(browser)
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"The default export is not a React Component in page: "/hmr/about5""`
        )
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
  })

  it('should recover after a bad return from the render function', async () => {
    const browser = await next.browser(basePath + '/hmr/about6')

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.patchFile(
      join('pages', 'hmr', 'about6.js'),
      (content) =>
        content.replace(
          'export default',
          'export default () => /search/;\nexport const fn ='
        ),
      async () => {
        await assertHasRedbox(browser)
        // TODO: Replace this when webpack 5 is the default
        expect(await getRedboxHeader(browser)).toMatch(
          `Objects are not valid as a React child (found: [object RegExp]). If you meant to render a collection of children, use an array instead.`
        )
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
  })

  it('should recover after undefined exported as default', async () => {
    const browser = await next.browser(basePath + '/hmr/about7')
    const aboutPage = join('pages', 'hmr', 'about7.js')

    const aboutContent = await next.readFile(aboutPage)
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
      ),
      async () => {
        await assertHasRedbox(browser)
        expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
          `"The default export is not a React Component in page: "/hmr/about7""`
        )
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
    await assertNoRedbox(browser)
  })

  it('should recover after webpack parse error in an imported file', async () => {
    const browser = await next.browser(basePath + '/hmr/about8')

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.patchFile(
      join('pages', 'hmr', 'about8.js'),
      (content) =>
        content.replace(
          'export default',
          'import "../../components/parse-error.xyz"\nexport default'
        ),
      async () => {
        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch('Build Error')

        if (process.env.IS_TURBOPACK_TEST) {
          expect(await getRedboxSource(browser)).toMatchInlineSnapshot(`
              "./components/parse-error.xyz
              Unknown module type
              This module doesn't have an associated type. Use a known file extension, or register a loader for it.

              Read more: https://nextjs.org/docs/app/api-reference/next-config-js/turbo#webpack-loaders"
            `)
        } else if (process.env.NEXT_RSPACK) {
          expect(trimEndMultiline(await getRedboxSource(browser)))
            .toMatchInlineSnapshot(`
         "./components/parse-error.xyz
           × Module parse failed:
           ╰─▶   × JavaScript parse error: Expression expected
                  ╭─[3:0]
                1 │ This
                2 │ is
                3 │ }}}
                  · ─
                4 │ invalid
                5 │ js
                  ╰────

           help:
                 You may need an appropriate loader to handle this file type.

         Import trace for requested module:
         ./components/parse-error.xyz
         ./pages/hmr/about8.js"
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
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
    await assertNoRedbox(browser)
  })

  it('should recover after loader parse error in an imported file', async () => {
    const browser = await next.browser(basePath + '/hmr/about9')

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })

    await next.patchFile(
      join('pages', 'hmr', 'about9.js'),
      (content) =>
        content.replace(
          'export default',
          'import "../../components/parse-error.js"\nexport default'
        ),
      async () => {
        await assertHasRedbox(browser)
        expect(await getRedboxHeader(browser)).toMatch('Build Error')
        let redboxSource = await getRedboxSource(browser)

        redboxSource = redboxSource.replace(`${next.testDir}`, '.')
        if (process.env.IS_TURBOPACK_TEST) {
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

         Expression expected

         Import traces:
           Browser:
             ./components/parse-error.js
             ./pages/hmr/about9.js

           SSR:
             ./components/parse-error.js
             ./pages/hmr/about9.js"
        `)
        } else if (process.env.NEXT_RSPACK) {
          expect(trimEndMultiline(next.normalizeTestDirContent(redboxSource)))
            .toMatchInlineSnapshot(`
         "./components/parse-error.js
           × Module build failed:
           ╰─▶   × Error:   x Expression expected
                 │    ,-[3:1]
                 │  1 | This
                 │  2 | is
                 │  3 | }}}
                 │    : ^
                 │  4 | invalid
                 │  5 | js
                 │    \`----
                 │
                 │
                 │ Caused by:
                 │     Syntax Error

         Import trace for requested module:
         ./components/parse-error.js
         ./pages/hmr/about9.js"
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
      }
    )

    await retry(async () => {
      expect(await getBrowserBodyText(browser)).toMatch(
        /This is the about page/
      )
    })
    await assertNoRedbox(browser)
  })

  it('should recover from errors in getInitialProps in client', async () => {
    const browser = await next.browser(basePath + '/hmr')
    const erroredPage = join('pages', 'hmr', 'error-in-gip.js')
    const errorContent = await next.readFile(erroredPage)
    await browser.elementByCss('#error-in-gip-link').click()

    await assertHasRedbox(browser)
    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
      `"an-expected-error-in-gip"`
    )

    await next.patchFile(
      erroredPage,
      (content) => content.replace('throw error', 'return {}'),
      async () => {
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
      }
    )
  })

  it('should recover after an error reported via SSR', async () => {
    const browser = await next.browser(basePath + '/hmr/error-in-gip')
    await assertHasRedbox(browser)
    expect(await getRedboxDescription(browser)).toMatchInlineSnapshot(
      `"an-expected-error-in-gip"`
    )

    await next.patchFile(
      join('pages', 'hmr', 'error-in-gip.js'),
      (content) => content.replace('throw error', 'return {}'),
      async () => {
        await retry(async () => {
          expect(await getBrowserBodyText(browser)).toMatch(/Hello/)
        })
      }
    )

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
  })

  if (!process.env.IS_TURBOPACK_TEST) {
    it('should have client HMR events in trace file', async () => {
      const traceData = await next.readFile(`${getDistDir()}/trace`)
      expect(traceData).toContain('client-hmr-latency')
      expect(traceData).toContain('client-error')
      expect(traceData).toContain('client-success')
      expect(traceData).toContain('client-full-reload')
    })
  }
}
