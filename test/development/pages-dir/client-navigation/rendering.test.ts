/* eslint-env jest */

import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP, getDistDir, renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST } from 'next/constants'
import path from 'path'
import url from 'url'

const isReact18 = parseInt(process.env.NEXT_TEST_REACT_VERSION) === 18

describe('Client Navigation rendering', () => {
  const { isTurbopack, next } = nextTestSetup({
    files: path.join(__dirname, 'fixture'),
    env: {
      TEST_STRICT_NEXT_HEAD: String(true),
    },
  })
  const isRspack = !!process.env.NEXT_RSPACK

  function render(
    pathname: Parameters<typeof renderViaHTTP>[1],
    query?: Parameters<typeof renderViaHTTP>[2]
  ) {
    return renderViaHTTP(next.appPort, pathname, query)
  }

  function fetch(
    pathname: Parameters<typeof renderViaHTTP>[1],
    query?: Parameters<typeof renderViaHTTP>[2]
  ) {
    return fetchViaHTTP(next.appPort, pathname, query)
  }

  async function get$(path: any, query?: any) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe('Rendering via HTTP', () => {
    test('renders a stateless component', async () => {
      const html = await render('/stateless')
      expect(html).toContain('<meta charSet="utf-8" data-next-head=""/>')
      expect(html).toContain('My component!')
    })

    it('should should not contain scripts that are not js', async () => {
      const $ = await get$('/')
      $('script[src]').each((_index, element) => {
        const parsedUrl = url.parse($(element).attr('src'))
        if (!parsedUrl.pathname.endsWith('.js')) {
          throw new Error(
            `Page includes script that is not a javascript file ${parsedUrl.pathname}`
          )
        }
      })
    })

    test('renders with fragment syntax', async () => {
      const html = await render('/fragment-syntax')
      expect(html.includes('My component!')).toBeTruthy()
    })

    test('renders when component is a forwardRef instance', async () => {
      const html = await render('/forwardRef-component')
      expect(
        html.includes('This is a component with a forwarded ref')
      ).toBeTruthy()
    })

    test('renders when component is a memo instance', async () => {
      const html = await render('/memo-component')
      expect(html.includes('Memo component')).toBeTruthy()
    })

    it('should render the page with custom extension', async () => {
      const html = await render('/custom-extension')
      expect(html).toContain('<div>Hello</div>')
      expect(html).toContain('<div>World</div>')
    })

    it('should render the page without `err` property', async () => {
      const html = await render('/')
      expect(html).not.toContain('"err"')
    })

    it('should render the page with `nextExport` property', async () => {
      const html = await render('/')
      expect(html).toContain('"nextExport"')
    })

    it('should render the page without `nextExport` property', async () => {
      const html = await render('/async-props')
      expect(html).not.toContain('"nextExport"')
    })

    test('renders styled jsx', async () => {
      const $ = await get$('/styled-jsx')
      const styleId = $('#blue-box').attr('class')
      const style = $('style')

      expect(style.text()).toMatch(
        new RegExp(`p.${styleId}{color:(?:blue|#00f)`)
      )
    })

    test('renders styled jsx external', async () => {
      const $ = await get$('/styled-jsx-external')
      const styleId = $('#blue-box').attr('class')
      const style = $('style')

      expect(style.text()).toMatch(
        new RegExp(`p.${styleId}{color:(?:blue|#00f)`)
      )
    })

    test('renders properties populated asynchronously', async () => {
      const html = await render('/async-props')
      expect(html.includes('Diego Milito')).toBeTruthy()
    })

    test('renders a link component', async () => {
      const $ = await get$('/link')
      const link = $('a[href="/about"]')
      expect(link.text()).toBe('About')
    })

    test('getInitialProps circular structure', async () => {
      const browser = await webdriver(next.appPort, '/circular-json-error')

      if (isReact18 && isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Circular structure in "getInitialProps" result of page "/circular-json-error". https://nextjs.org/docs/messages/circular-structure",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": null,
           "stack": [
             "new Promise <anonymous>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "Circular structure in "getInitialProps" result of page "/circular-json-error". https://nextjs.org/docs/messages/circular-structure",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": null,
           "stack": [],
         }
        `)
      }
    })

    test('getInitialProps should be class method', async () => {
      const browser = await webdriver(
        next.appPort,
        '/instance-get-initial-props'
      )

      await expect(browser).toDisplayRedbox(`
       {
         "description": ""InstanceInitialPropsPage.getInitialProps()" is defined as an instance method - visit https://nextjs.org/docs/messages/get-initial-props-as-an-instance-method for more information.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    })

    test('getInitialProps resolves to null', async () => {
      const browser = await webdriver(next.appPort, '/empty-get-initial-props')

      await expect(browser).toDisplayRedbox(`
       {
         "description": ""EmptyInitialPropsPage.getInitialProps()" should resolve to an object. But found "null" instead.",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    })

    test('default Content-Type', async () => {
      const res = await fetch('/stateless')
      expect(res.headers.get('Content-Type')).toMatch(
        'text/html; charset=utf-8'
      )
    })

    test('setting Content-Type in getInitialProps', async () => {
      const res = await fetch('/custom-encoding')
      expect(res.headers.get('Content-Type')).toMatch(
        'text/html; charset=iso-8859-2'
      )
    })

    test('should render 404 for _next routes that do not exist', async () => {
      const res = await fetch('/_next/abcdef')
      expect(res.status).toBe(404)
    })

    test('should render page that has module.exports anywhere', async () => {
      const res = await fetch('/exports')
      expect(res.status).toBe(200)
    })

    test('allows to import .json files', async () => {
      const html = await render('/json')
      expect(html.includes('Vercel')).toBeTruthy()
    })

    test('default export is not a React Component', async () => {
      const browser = await webdriver(next.appPort, '/no-default-export')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "The default export is not a React Component in page: "/no-default-export"",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    })

    test('error-inside-page', async () => {
      const browser = await webdriver(next.appPort, '/error-inside-page')

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "This is an expected error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "pages/error-inside-page.js (2:9) @ {default export}
         > 2 |   throw new Error('This is an expected error')
             |         ^",
           "stack": [
             "{default export} pages/error-inside-page.js (2:9)",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "This is an expected error",
           "environmentLabel": null,
           "label": "Runtime Error",
           "source": "pages/error-inside-page.js (2:9) @ default
         > 2 |   throw new Error('This is an expected error')
             |         ^",
           "stack": [
             "default pages/error-inside-page.js (2:9)",
           ],
         }
        `)
      }
    })

    test('error-in-the-global-scope', async () => {
      const browser = await webdriver(
        next.appPort,
        '/error-in-the-global-scope'
      )

      if (isTurbopack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "aa is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "pages/error-in-the-global-scope.js (1:1) @ module evaluation
         > 1 | aa = 10 //eslint-disable-line
             | ^",
           "stack": [
             "module evaluation pages/error-in-the-global-scope.js (1:1)",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else if (isRspack) {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "aa is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "pages/error-in-the-global-scope.js (1:1) @ eval
         > 1 | aa = 10 //eslint-disable-line
             | ^",
           "stack": [
             "eval pages/error-in-the-global-scope.js (1:1)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      } else {
        await expect(browser).toDisplayRedbox(`
         {
           "description": "aa is not defined",
           "environmentLabel": null,
           "label": "Runtime ReferenceError",
           "source": "pages/error-in-the-global-scope.js (1:1) @ eval
         > 1 | aa = 10 //eslint-disable-line
             | ^",
           "stack": [
             "eval pages/error-in-the-global-scope.js (1:1)",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
             "<FIXME-next-dist-dir>",
           ],
         }
        `)
      }
    })

    it('should set Cache-Control header', async () => {
      // build dynamic page
      await fetch('/dynamic/ssr')

      const buildManifest = await next.readJSON(
        `${getDistDir()}/${BUILD_MANIFEST}`
      )
      const reactLoadableManifest = await next.readJSON(
        process.env.IS_TURBOPACK_TEST
          ? `${getDistDir()}/server/pages/dynamic/ssr/${REACT_LOADABLE_MANIFEST}`
          : `${getDistDir()}/${REACT_LOADABLE_MANIFEST}`
      )
      const resources = []

      const manifestKey = Object.keys(reactLoadableManifest).find((item) => {
        return item
          .replace(/\\/g, '/')
          .endsWith(
            process.env.IS_TURBOPACK_TEST
              ? 'components/hello1.js [client] (ecmascript, next/dynamic entry)'
              : 'ssr.js -> ../../components/hello1'
          )
      })
      expect(manifestKey).toBeString()

      // test dynamic chunk
      resources.push('/_next/' + reactLoadableManifest[manifestKey].files[0])

      // test main.js runtime etc
      for (const item of buildManifest.pages['/dynamic/ssr']) {
        resources.push('/_next/' + item)
      }

      for (const item of buildManifest.devFiles) {
        resources.push('/_next/' + item)
      }

      const responses = await Promise.all(
        resources.map((resource) => fetch(resource))
      )

      responses.forEach((res) => {
        try {
          expect(res.headers.get('Cache-Control')).toBe(
            'no-store, must-revalidate'
          )
        } catch (err) {
          err.message = res.url + ' ' + err.message
          throw err
        }
      })
    })

    test('asPath', async () => {
      const $ = await get$('/nav/as-path', { aa: 10 })
      expect($('.as-path-content').text()).toBe('/nav/as-path?aa=10')
    })

    describe('404', () => {
      it('should 404 on not existent page', async () => {
        const $ = await get$('/non-existent')
        expect($('h1').text()).toBe('404')
        expect($('h2').text()).toBe('This page could not be found.')
      })

      it('should 404 on wrong casing', async () => {
        const $ = await get$('/NaV/aBoUt')
        expect($('h1').text()).toBe('404')
        expect($('h2').text()).toBe('This page could not be found.')
      })

      it('should not 404 for <page>/', async () => {
        const $ = await get$('/nav/about/')
        expect($('.nav-about p').text()).toBe('This is the about page.')
      })

      it('should should not contain a page script in a 404 page', async () => {
        const $ = await get$('/non-existent')
        $('script[src]').each((index, element) => {
          const src = $(element).attr('src')
          if (src.includes('/non-existent')) {
            throw new Error('Page includes page script')
          }
        })
      })
    })

    describe('with the HOC based router', () => {
      it('should navigate as expected', async () => {
        const $ = await get$('/nav/with-hoc')

        expect($('#pathname').text()).toBe('Current path: /nav/with-hoc')
      })

      it('should include asPath', async () => {
        const $ = await get$('/nav/with-hoc')

        expect($('#asPath').text()).toBe('Current asPath: /nav/with-hoc')
      })
    })

    it('should show a valid error when undefined is thrown', async () => {
      const browser = await webdriver(next.appPort, '/throw-undefined')

      await expect(browser).toDisplayRedbox(`
       {
         "description": "An undefined error was thrown, see here for more info: https://nextjs.org/docs/messages/threw-undefined",
         "environmentLabel": null,
         "label": "Runtime Error",
         "source": null,
         "stack": [],
       }
      `)
    })
  })
})
