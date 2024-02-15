import { createNextDescribe, FileRef } from 'e2e-utils'
import { join } from 'path'

createNextDescribe(
  'esm-externals',
  {
    files: {
      pages: new FileRef(join(__dirname, 'pages')),
      node_modules: new FileRef(join(__dirname, 'node_modules')),
      'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
      app: new FileRef(
        process.env.TURBOPACK
          ? join(__dirname, 'app')
          : // TODO webpack doesn't handle serverComponentsExternalPackages in SSR of client components correctly
            join(__dirname, 'app-webpack')
      ),
    },
  },
  ({ next, isTurbopack }) => {
    // Pages
    {
      const expectedHtml =
        /Hello <!-- -->World<!-- -->\+<!-- -->World<!-- -->\+<!-- -->World<!-- -->\+<!-- -->World\+World\+World/
      const expectedText = /Hello World\+World\+World\+World\+World\+World/
      const urls = ['/static', '/ssr', '/ssg']

      for (const url of urls) {
        it(`should return the correct SSR HTML for ${url}`, async () => {
          const res = await next.fetch(url)
          const html = await res.text()
          expect(html).toMatch(expectedHtml)
        })

        it(`should render the correct page for ${url}`, async () => {
          const browser = await next.browser(url)
          expect(await browser.elementByCss('body').text()).toMatch(
            expectedText
          )
        })
      }
    }

    // App dir
    {
      // TODO App Dir doesn't use esmExternals: true correctly for webpack and Turbopack
      // so we only verify that the page doesn't crash, but ignore the actual content
      const expectedHtml = /Hello/
      const expectedText = /Hello/
      // TODO webpack doesn't handle serverComponentsExternalPackages in SSR of client components correctly
      const urls = isTurbopack ? ['/server', '/client'] : ['/server']

      for (const url of urls) {
        it(`should return the correct SSR HTML for ${url}`, async () => {
          const res = await next.fetch(url)
          const html = await res.text()
          expect(html).toMatch(expectedHtml)
        })

        it(`should render the correct page for ${url}`, async () => {
          const browser = await next.browser(url)
          expect(await browser.elementByCss('body').text()).toMatch(
            expectedText
          )
        })
      }
    }
  }
)
