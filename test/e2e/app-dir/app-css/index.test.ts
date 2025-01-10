import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

const isPPREnabledByDefault = process.env.__NEXT_EXPERIMENTAL_PPR === 'true'

describe('app dir - css', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      '@picocss/pico': '1.5.7',
      sass: 'latest',
      '@next/mdx': 'canary',
    },
  })

  if (skipped) {
    return
  }

  describe('css support', () => {
    describe('server layouts', () => {
      it.skip('should support global css inside server layouts', async () => {
        const browser = await next.browser('/dashboard')

        // Should body text in red
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('.p')).color`
            ),
          'rgb(255, 0, 0)'
        )

        // Should inject global css for .green selectors
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('.green')).color`
            ),
          'rgb(0, 128, 0)'
        )
      })

      it('should support css modules inside server layouts', async () => {
        const browser = await next.browser('/css/css-nested')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#server-cssm')).color`
            ),
          'rgb(0, 128, 0)'
        )
      })

      it('should support external css imports', async () => {
        const browser = await next.browser('/css/css-external')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('main')).paddingTop`
            ),
          '80px'
        )
      })
    })

    describe('server pages', () => {
      it('should support global css inside server pages', async () => {
        const browser = await next.browser('/css/css-page')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })

      it('should support css modules inside server pages', async () => {
        const browser = await next.browser('/css/css-page')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#cssm')).color`
            ),
          'rgb(0, 0, 255)'
        )
      })

      it('should not contain pages css in app dir page', async () => {
        const html = await next.render('/css/css-page')
        expect(html).not.toContain('/pages/_app.css')
      })

      it('should support css modules shared between server pages', async () => {
        const browser = await next.browser('/css/css-page-shared-loading')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#cssm')).color`
            ),
          'rgb(0, 0, 255)'
        )
      })
    })

    describe('client layouts', () => {
      it('should support css modules inside client layouts', async () => {
        const browser = await next.browser('/client-nested')

        // Should render h1 in red
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })

      it('should support global css inside client layouts', async () => {
        const browser = await next.browser('/client-nested')

        // Should render button in red
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('button')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })
    })

    describe('client pages', () => {
      it('should support css modules inside client pages', async () => {
        const browser = await next.browser('/client-component-route')

        // Should render p in red
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('p')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })

      it('should support global css inside client pages', async () => {
        const browser = await next.browser('/client-component-route')

        // Should render `b` in blue
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('b')).color`
            ),
          'rgb(0, 0, 255)'
        )
      })
    })

    describe('client components', () => {
      it('should support css modules inside client page', async () => {
        const browser = await next.browser('/css/css-client')

        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#css-modules')).fontSize`
            ),
          '100px'
        )
      })

      it('should support css modules inside client components', async () => {
        const browser = await next.browser('/css/css-client/inner')

        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('#client-component')).fontSize`
            ),
          '100px'
        )
      })
    })

    describe('special entries', () => {
      it('should include css imported in loading.js', async () => {
        const $ = await next.render$('/loading-bug/hi')
        // The link tag should be hoist into head with precedence properties
        expect($('head link[data-precedence]').length).toBe(2)

        expect($('body h2').text()).toBe('Loading...')
      })

      it('should include css imported in client template.js', async () => {
        const browser = await next.browser('/template/clientcomponent')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('button')).fontSize`
            ),
          '100px'
        )
      })

      it('should include css imported in server template.js', async () => {
        const browser = await next.browser('/template/servercomponent')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })

      it('should include css imported in client not-found.js', async () => {
        const browser = await next.browser('/not-found/clientcomponent')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })

      it('should include css imported in server not-found.js', async () => {
        const browser = await next.browser('/not-found/servercomponent')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })

      it('should include root layout css for root not-found.js', async () => {
        const browser = await next.browser('/this-path-does-not-exist')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(210, 105, 30)'
        )
      })

      it('should include css imported in root not-found.js', async () => {
        const browser = await next.browser('/random-non-existing-path')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(210, 105, 30)'
        )
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).backgroundColor`
            ),
          'rgb(0, 0, 0)'
        )
      })

      it('should include css imported in error.js', async () => {
        const browser = await next.browser('/error/client-component')
        await browser.elementByCss('button').click()

        // Wait for error page to render and CSS to be loaded
        await new Promise((resolve) => setTimeout(resolve, 2000))

        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('button')).fontSize`
            ),
          '50px'
        )
      })
    })

    describe('page extensions', () => {
      it('should include css imported in MDX pages', async () => {
        const browser = await next.browser('/mdx')
        await check(
          async () =>
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            ),
          'rgb(255, 0, 0)'
        )
      })
    })

    describe('chunks', () => {
      it('should bundle css resources into chunks', async () => {
        const html = await next.render('/dashboard')

        expect(
          [
            ...html.matchAll(
              /<link rel="stylesheet" href="[^<]+\.css(\?v=\d+)?"/g
            ),
          ].length
        ).toBe(3)
      })
    })

    describe('css ordering', () => {
      it('should have inner layers take precedence over outer layers', async () => {
        const browser = await next.browser('/ordering')
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('h1')).color`
          )
        ).toBe('rgb(255, 0, 0)')
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('h2')).color`
          )
        ).toBe('rgb(255, 0, 0)')
      })
    })

    if (isNextDev) {
      it('should not affect css orders during HMR', async () => {
        const filePath = 'app/ordering/page.js'
        const origContent = await next.readFile(filePath)

        // h1 should be red
        const browser = await next.browser('/ordering')
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('h1')).color`
          )
        ).toBe('rgb(255, 0, 0)')
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('h2')).color`
          )
        ).toBe('rgb(255, 0, 0)')

        try {
          await next.patchFile(
            filePath,
            origContent.replace('<h1>Hello</h1>', '<h1>Hello!</h1>')
          )

          // Wait for HMR to trigger
          await check(
            () => browser.eval(`document.querySelector('h1').textContent`),
            'Hello!'
          )
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h1')).color`
            )
          ).toBe('rgb(255, 0, 0)')
          expect(
            await browser.eval(
              `window.getComputedStyle(document.querySelector('h2')).color`
            )
          ).toBe('rgb(255, 0, 0)')
        } finally {
          await next.patchFile(filePath, origContent)
        }
      })

      // Turbopack doesn't preload styles
      if (!process.env.TURBOPACK) {
        it('should not preload styles twice during HMR', async () => {
          const filePath = 'app/hmr/page.js'
          const origContent = await next.readFile(filePath)

          const browser = await next.browser('/hmr')

          try {
            await next.patchFile(
              filePath,
              origContent.replace(
                '<div>hello!</div>',
                '<div>hello world!</div>'
              )
            )

            // Wait for HMR to trigger
            await check(
              () => browser.elementByCss('body').text(),
              'hello world!'
            )

            // there should be only 1 preload link
            expect(
              await browser.eval(
                `(() => {
                const tags = document.querySelectorAll('link[rel="preload"][href^="/_next/static/css"]')
                const counts = new Map();
                for (const tag of tags) {
                  counts.set(tag.href, (counts.get(tag.href) || 0) + 1)
                }
                return Math.max(...counts.values())
              })()`
              )
            ).toBe(1)
          } finally {
            await next.patchFile(filePath, origContent)
          }
        })
      }

      it('should reload @import styles during HMR', async () => {
        const filePath = 'app/hmr/import/actual-styles.css'
        const origContent = await next.readFile(filePath)

        // background should be red
        const browser = await next.browser('/hmr/import')
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('body')).backgroundColor`
          )
        ).toBe('rgb(255, 0, 0)')

        try {
          await next.patchFile(
            filePath,
            origContent.replace(
              'background-color: red;',
              'background-color: blue;'
            )
          )

          // Wait for HMR to trigger
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('body')).backgroundColor`
              ),
            'rgb(0, 0, 255)'
          )
        } finally {
          await next.patchFile(filePath, origContent)
        }
      })

      describe('multiple entries', () => {
        it.skip('should only inject the same style once if used by different layers', async () => {
          const browser = await next.browser('/css/css-duplicate-2/client')
          expect(
            await browser.eval(
              `[...document.styleSheets].filter(({ cssRules }) =>
                [...cssRules].some(({ cssText }) => (cssText||'').includes('_randomized_string_for_testing_'))
              ).length`
            )
          ).toBe(1)
        })

        it('should deduplicate styles on the module level', async () => {
          const browser = await next.browser('/css/css-conflict-layers')
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('.btn:not(.btn-blue)')).backgroundColor`
              ),
            'rgb(255, 255, 255)'
          )
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('.btn.btn-blue')).backgroundColor`
              ),
            'rgb(0, 0, 255)'
          )
        })

        it('should only include the same style once in the flight data', async () => {
          const initialHtml = await next.render('/css/css-duplicate-2/server')

          if (process.env.TURBOPACK) {
            expect(
              initialHtml.match(/app_css_css-duplicate-2_[\w]+\.css/g).length
            ).toBe(5)
          } else {
            // Even if it's deduped by Float, it should still only be included once in the payload.

            const matches = initialHtml
              .match(/\/_next\/static\/css\/.+?\.css/g)
              .sort()

            // Heavy on testing React implementation details.
            // Assertions may change often but what needs to be checked on change is if styles are needlessly duplicated in Flight data
            // There are 3 matches, one for the rendered <link> (HTML), one for Float preload (Flight) and one for the <link> inside Flight payload.
            // And there is one match for the not found style
            if (isPPREnabledByDefault) {
              expect(matches).toEqual([
                // may be split across chunks when we bump React
                '/_next/static/css/app/css/css-duplicate-2/layout.css',
                '/_next/static/css/app/css/css-duplicate-2/layout.css',
                '/_next/static/css/app/css/css-duplicate-2/layout.css',
                '/_next/static/css/app/css/layout.css',
                '/_next/static/css/app/css/layout.css',
                '/_next/static/css/app/css/layout.css',
                '/_next/static/css/app/layout.css',
                '/_next/static/css/app/layout.css',
                '/_next/static/css/app/layout.css',
                '/_next/static/css/app/not-found.css',
              ])
            } else {
              expect(matches).toEqual([
                '/_next/static/css/app/css/css-duplicate-2/layout.css',
                '/_next/static/css/app/css/css-duplicate-2/layout.css',
                '/_next/static/css/app/css/css-duplicate-2/layout.css',
                '/_next/static/css/app/css/layout.css',
                '/_next/static/css/app/css/layout.css',
                '/_next/static/css/app/css/layout.css',
                '/_next/static/css/app/layout.css',
                '/_next/static/css/app/layout.css',
                '/_next/static/css/app/layout.css',
                '/_next/static/css/app/not-found.css',
              ])
            }
          }
        })

        it.skip('should only load chunks for the css module that is used by the specific entrypoint', async () => {
          // Visit /b first
          await next.render('/css/css-duplicate/b')

          const browser = await next.browser('/css/css-duplicate/a')
          expect(
            await browser.eval(
              `[...document.styleSheets].some(({ href }) => href.includes('/a/page.css'))`
            )
          ).toBe(true)

          // Should not load the chunk from /b
          expect(
            await browser.eval(
              `[...document.styleSheets].some(({ href }) => href.includes('/b/page.css'))`
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
    if (!isNextDev) {
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
    if (isNextDev) {
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

      it('should not break HMR when CSS is imported in a server component', async () => {
        const filePath = 'app/hmr/page.js'
        const origContent = await next.readFile(filePath)

        const browser = await next.browser('/hmr')
        await browser.eval(`window.__v = 1`)
        try {
          await next.patchFile(filePath, origContent.replace('hello!', 'hmr!'))
          await check(() => browser.elementByCss('body').text(), 'hmr!')

          // Make sure it doesn't reload the page
          expect(await browser.eval(`window.__v`)).toBe(1)
        } finally {
          await next.patchFile(filePath, origContent)
        }
      })

      it('should not create duplicate link tags during HMR', async () => {
        const filePath = 'app/hmr/global.css'
        const origContent = await next.readFile(filePath)

        const browser = await next.browser('/hmr')
        try {
          await next.patchFile(
            filePath,
            origContent.replace('background: gray;', 'background: red;')
          )
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('body')).backgroundColor`
              ),
            'rgb(255, 0, 0)'
          )

          await check(
            () =>
              browser.eval(
                `(() => {
                  const tags = document.querySelectorAll('link[rel="stylesheet"][href^="/_next/static"]')
                  const counts = new Map();
                  for (const tag of tags) {
                    counts.set(tag.href, (counts.get(tag.href) || 0) + 1)
                  }
                  return Math.max(...counts.values())
                })()`
              ),
            1
          )
        } finally {
          await next.patchFile(filePath, origContent)
        }
      })

      it('should support HMR with sass/scss', async () => {
        const filePath1 = 'app/css/sass/global.scss'
        const origContent1 = await next.readFile(filePath1)
        const filePath2 = 'app/css/sass/global.sass'
        const origContent2 = await next.readFile(filePath2)

        const browser = await next.browser('/css/sass/inner')
        // .scss
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('#scss-server-layout')).color`
          )
        ).toBe('rgb(222, 184, 135)')
        // .sass
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('#sass-server-layout')).color`
          )
        ).toBe('rgb(165, 42, 42)')

        try {
          await next.patchFile(
            filePath1,
            origContent1.replace('color: burlywood;', 'color: red;')
          )
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('#scss-server-layout')).color`
              ),
            'rgb(255, 0, 0)'
          )
        } finally {
          await next.patchFile(filePath1, origContent1)
        }

        try {
          await next.patchFile(
            filePath2,
            origContent2.replace('color: brown', 'color: red')
          )
          await check(
            () =>
              browser.eval(
                `window.getComputedStyle(document.querySelector('#sass-server-layout')).color`
              ),
            'rgb(255, 0, 0)'
          )
        } finally {
          await next.patchFile(filePath2, origContent2)
        }
      })
    }
  })

  if (isNextDev) {
    describe('Suspensey CSS', () => {
      it('should suspend on CSS imports if its slow on client navigation', async () => {
        const browser = await next.browser('/suspensey-css')
        await browser.elementByCss('#slow').click()
        await check(() => browser.eval(`document.body.innerText`), 'Get back')
        await check(async () => {
          return await browser.eval(`window.__log`)
        }, /background = rgb\(255, 255, 0\)/)
      })
    })
  }
})
