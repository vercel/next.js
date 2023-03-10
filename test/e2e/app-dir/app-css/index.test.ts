import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'

createNextDescribe(
  'app dir css',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      swr: '2.0.0-rc.0',
      '@picocss/pico': '1.5.7',
      react: 'latest',
      'react-dom': 'latest',
      sass: 'latest',
      '@next/mdx': 'canary',
    },
  },
  ({ next, isNextDev: isDev }) => {
    describe('css support', () => {
      describe('server layouts', () => {
        it('should support global css inside server layouts', async () => {
          const browser = await next.browser('/dashboard')

          // Should body text in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('.p')).color`
            )
          ).toBe('rgb(255, 0, 0)')

          // Should inject global css for .green selectors
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('.green')).color`
            )
          ).toBe('rgb(0, 128, 0)')
        })

        it('should support css modules inside server layouts', async () => {
          const browser = await next.browser('/css/css-nested')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#server-cssm')).color`
            )
          ).toBe('rgb(0, 128, 0)')
        })

        it('should support external css imports', async () => {
          const browser = await next.browser('/css/css-external')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('main')).paddingTop`
            )
          ).toBe('80px')
        })
      })

      describe('server pages', () => {
        it('should support global css inside server pages', async () => {
          const browser = await next.browser('/css/css-page')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should support css modules inside server pages', async () => {
          const browser = await next.browser('/css/css-page')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#cssm')).color`
            )
          ).toBe('rgb(0, 0, 255)')
        })

        it('should not contain pages css in app dir page', async () => {
          const html = await next.render('/css/css-page')
          expect(html).not.toContain('/pages/_app.css')
        })

        if (!isDev) {
          it('should not include unused css modules in the page in prod', async () => {
            const browser = await next.browser('/css/css-page/unused')
            expect(
              await browser.eval(
                `[...document.styleSheets].some(({ rules }) => [...rules].some(rule => rule.selectorText.includes('this_should_not_be_included')))`
              )
            ).toBe(false)
          })

          it('should not include unused css modules in nested pages in prod', async () => {
            const browser = await next.browser(
              '/css/css-page/unused-nested/inner'
            )
            expect(
              await browser.eval(
                `[...document.styleSheets].some(({ rules }) => [...rules].some(rule => rule.selectorText.includes('this_should_not_be_included_in_inner_path')))`
              )
            ).toBe(false)
          })
        }
      })

      describe('client layouts', () => {
        it('should support css modules inside client layouts', async () => {
          const browser = await next.browser('/client-nested')

          // Should render h1 in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should support global css inside client layouts', async () => {
          const browser = await next.browser('/client-nested')

          // Should render button in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('button')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })
      })

      describe('client pages', () => {
        it('should support css modules inside client pages', async () => {
          const browser = await next.browser('/client-component-route')

          // Should render p in red
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('p')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should support global css inside client pages', async () => {
          const browser = await next.browser('/client-component-route')

          // Should render `b` in blue
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('b')).color`
            )
          ).toBe('rgb(0, 0, 255)')
        })
      })

      describe('client components', () => {
        it('should support css modules inside client page', async () => {
          const browser = await next.browser('/css/css-client')

          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#css-modules')).fontSize`
            )
          ).toBe('100px')
        })

        it('should support css modules inside client components', async () => {
          const browser = await next.browser('/css/css-client/inner')

          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#client-component')).fontSize`
            )
          ).toBe('100px')
        })
      })

      describe('special entries', () => {
        it('should include css imported in loading.js', async () => {
          const html = await next.render('/loading-bug/hi')
          // The link tag should be included together with loading
          expect(html).toMatch(
            /<link rel="stylesheet" href="(.+)\.css"\/><h2>Loading...<\/h2>/
          )
        })

        it('should include css imported in client template.js', async () => {
          const browser = await next.browser('/template/clientcomponent')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('button')).fontSize`
            )
          ).toBe('100px')
        })

        it('should include css imported in server template.js', async () => {
          const browser = await next.browser('/template/servercomponent')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should include css imported in client not-found.js', async () => {
          const browser = await next.browser('/not-found/clientcomponent')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should include css imported in server not-found.js', async () => {
          const browser = await next.browser('/not-found/servercomponent')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })

        it('should include css imported in error.js', async () => {
          const browser = await next.browser('/error/client-component')
          await browser.elementByCss('button').click()

          // Wait for error page to render and CSS to be loaded
          await new Promise((resolve) => setTimeout(resolve, 2000))

          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('button')).fontSize`
            )
          ).toBe('50px')
        })
      })

      describe('page extensions', () => {
        it('should include css imported in MDX pages', async () => {
          const browser = await next.browser('/mdx')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        })
      })

      if (isDev) {
        describe('multiple entries', () => {
          it('should only inject the same style once if used by different layers', async () => {
            const browser = await next.browser('/css/css-duplicate-2/client')
            expect(
              await browser.eval(
                `[...document.styleSheets].filter(({ cssRules }) =>
                  [...cssRules].some(({ cssText }) => (cssText||'').includes('_randomized_string_for_testing_'))
                ).length`
              )
            ).toBe(1)
          })

          it('should only include the same style once in the flight data', async () => {
            const initialHtml = await next.render('/css/css-duplicate-2/server')

            // Even if it's deduped by Float, it should still only be included once in the payload.
            // There are two matches, one for the rendered <link> and one for the flight data.
            expect(
              initialHtml.match(/duplicate-2_style_module_css\.css/g).length
            ).toBe(2)
          })

          it('should only load chunks for the css module that is used by the specific entrypoint', async () => {
            // Visit /b first
            await next.render('/css/css-duplicate/b')

            const browser = await next.browser('/css/css-duplicate/a')
            expect(
              await browser.eval(
                `[...document.styleSheets].some(({ href }) => href.endsWith('/a/page.css'))`
              )
            ).toBe(true)

            // Should not load the chunk from /b
            expect(
              await browser.eval(
                `[...document.styleSheets].some(({ href }) => href.endsWith('/b/page.css'))`
              )
            ).toBe(false)
          })
        })
      }
    })

    describe('sass support', () => {
      describe('server layouts', () => {
        it('should support global sass/scss inside server layouts', async () => {
          const browser = await next.browser('/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-layout')).color`
            )
          ).toBe('rgb(165, 42, 42)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-layout')).color`
            )
          ).toBe('rgb(222, 184, 135)')
        })

        it('should support sass/scss modules inside server layouts', async () => {
          const browser = await next.browser('/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-layout')).backgroundColor`
            )
          ).toBe('rgb(233, 150, 122)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-layout')).backgroundColor`
            )
          ).toBe('rgb(139, 0, 0)')
        })
      })

      describe('server pages', () => {
        it('should support global sass/scss inside server pages', async () => {
          const browser = await next.browser('/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-page')).color`
            )
          ).toBe('rgb(245, 222, 179)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-page')).color`
            )
          ).toBe('rgb(255, 99, 71)')
        })

        it('should support sass/scss modules inside server pages', async () => {
          const browser = await next.browser('/css/sass/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-server-page')).backgroundColor`
            )
          ).toBe('rgb(75, 0, 130)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-server-page')).backgroundColor`
            )
          ).toBe('rgb(0, 255, 255)')
        })
      })

      describe('client layouts', () => {
        it('should support global sass/scss inside client layouts', async () => {
          const browser = await next.browser('/css/sass-client/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-client-layout')).color`
            )
          ).toBe('rgb(165, 42, 42)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-client-layout')).color`
            )
          ).toBe('rgb(222, 184, 135)')
        })

        it('should support sass/scss modules inside client layouts', async () => {
          const browser = await next.browser('/css/sass-client/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-client-layout')).backgroundColor`
            )
          ).toBe('rgb(233, 150, 122)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-client-layout')).backgroundColor`
            )
          ).toBe('rgb(139, 0, 0)')
        })
      })

      describe('client pages', () => {
        it('should support global sass/scss inside client pages', async () => {
          const browser = await next.browser('/css/sass-client/inner')

          // .sass
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('#sass-client-page')).color`
              ),
            'rgb(245, 222, 179)'
          )
          // .scss
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('#scss-client-page')).color`
              ),
            'rgb(255, 99, 71)'
          )
        })

        it('should support sass/scss modules inside client pages', async () => {
          const browser = await next.browser('/css/sass-client/inner')
          // .sass
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#sass-client-page')).backgroundColor`
            )
          ).toBe('rgb(75, 0, 130)')
          // .scss
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#scss-client-page')).backgroundColor`
            )
          ).toBe('rgb(0, 255, 255)')
        })
      })
    })

    // Pages directory shouldn't be affected when `appDir` is enabled
    describe('pages dir', () => {
      if (!isDev) {
        it('should include css modules and global css after page transition', async () => {
          const browser = await next.browser('/css-modules/page1')
          await browser.elementByCss('a').click()
          await browser.waitForElementByCss('#page2')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).backgroundColor`
            )
          ).toBe('rgb(205, 92, 92)')

          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('.page-2')).backgroundColor`
            )
          ).toBe('rgb(255, 228, 181)')
        })
      }
    })

    describe('HMR', () => {
      if (isDev) {
        it('should support HMR for CSS imports in server components', async () => {
          const filePath = 'app/css/css-page/style.css'
          const origContent = await next.readFile(filePath)

          // h1 should be red
          const browser = await next.browser('/css/css-page')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')

          try {
            await next.patchFile(filePath, origContent.replace('red', 'blue'))

            // Wait for HMR to trigger
            await check(
              () =>
                browser.eval(
                  `window.getComputedStyle(document.querySelector('h1')).color`
                ),
              'rgb(0, 0, 255)'
            )
          } finally {
            await next.patchFile(filePath, origContent)
          }
        })

        it('should support HMR for CSS imports in client components', async () => {
          const filePath = 'app/css/css-client/client-page.css'
          const origContent = await next.readFile(filePath)

          // h1 should be red
          const browser = await next.browser('/css/css-client')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')

          try {
            await next.patchFile(filePath, origContent.replace('red', 'blue'))

            await check(
              () =>
                browser.eval(
                  `window.getComputedStyle(document.querySelector('h1')).color`
                ),
              'rgb(0, 0, 255)'
            )
          } finally {
            await next.patchFile(filePath, origContent)
          }
        })
      }
    })
  }
)
