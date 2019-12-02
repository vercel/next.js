/* eslint-env jest */

import cheerio from 'cheerio'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST } from 'next/constants'
import { join } from 'path'

export default function(render, fetch) {
  async function get$(path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe('Rendering via HTTP', () => {
    test('renders a stateless component', async () => {
      const html = await render('/stateless')
      expect(html.includes('<meta charSet="utf-8"/>')).toBeTruthy()
      expect(html.includes('My component!')).toBeTruthy()
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

    // default-head contains an empty <Head />.
    test('header renders default charset', async () => {
      const html = await render('/default-head')
      expect(html.includes('<meta charSet="utf-8"/>')).toBeTruthy()
      expect(html.includes('next-head, but only once.')).toBeTruthy()
    })

    test('header renders default viewport', async () => {
      const html = await render('/default-head')
      expect(html).toContain(
        '<meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1"/>'
      )
    })

    test('header helper renders header information', async () => {
      const html = await render('/head')
      expect(html.includes('<meta charSet="iso-8859-5"/>')).toBeTruthy()
      expect(html.includes('<meta content="my meta"/>')).toBeTruthy()
      expect(html).toContain(
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
      )
      expect(html.includes('I can have meta tags')).toBeTruthy()
    })

    test('header helper dedupes tags', async () => {
      const html = await render('/head')
      expect(html).toContain('<meta charSet="iso-8859-5"/>')
      expect(html).not.toContain('<meta charSet="utf-8"/>')
      expect(html).toContain(
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
      )
      expect(html.match(/<meta name="viewport" /g).length).toBe(
        1,
        'Should contain only one viewport'
      )
      expect(html).not.toContain(
        '<meta name="viewport" content="width=device-width"/>'
      )
      expect(html).toContain('<meta content="my meta"/>')
      expect(html).toContain(
        '<link rel="stylesheet" href="/dup-style.css"/><link rel="stylesheet" href="/dup-style.css"/>'
      )
      expect(html).toContain('<link rel="stylesheet" href="dedupe-style.css"/>')
      expect(html).not.toContain(
        '<link rel="stylesheet" href="dedupe-style.css"/><link rel="stylesheet" href="dedupe-style.css"/>'
      )
      expect(html).toContain(
        '<link rel="alternate" hrefLang="en" href="/last/en"/>'
      )
      expect(html).not.toContain(
        '<link rel="alternate" hrefLang="en" href="/first/en"/>'
      )
    })

    test('header helper dedupes tags with the same key as the default', async () => {
      const html = await render('/head-duplicate-default-keys')
      expect(html).toContain('<meta charSet="iso-8859-5"/>')
      expect(html).not.toContain('<meta charSet="utf-8"/>')
      expect(html).toContain(
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
      )
      expect(html).not.toContain('<meta name="width=device-width"/>')
    })

    test('header helper avoids dedupe of specific tags', async () => {
      const html = await render('/head')
      expect(html).toContain('<meta property="article:tag" content="tag1"/>')
      expect(html).toContain('<meta property="article:tag" content="tag2"/>')
      expect(html).not.toContain('<meta property="dedupe:tag" content="tag3"/>')
      expect(html).toContain('<meta property="dedupe:tag" content="tag4"/>')
      expect(html).toContain(
        '<meta property="og:image" content="ogImageTag1"/>'
      )
      expect(html).toContain(
        '<meta property="og:image" content="ogImageTag2"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:alt" content="ogImageAltTag1"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:alt" content="ogImageAltTag2"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:width" content="ogImageWidthTag1"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:width" content="ogImageWidthTag2"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:height" content="ogImageHeightTag1"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:height" content="ogImageHeightTag2"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:type" content="ogImageTypeTag1"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:type" content="ogImageTypeTag2"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:secure_url" content="ogImageSecureUrlTag1"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:secure_url" content="ogImageSecureUrlTag2"/>'
      )
      expect(html).toContain(
        '<meta property="og:image:url" content="ogImageUrlTag1"/>'
      )
      expect(html).toContain('<meta property="fb:pages" content="fbpages1"/>')
      expect(html).toContain('<meta property="fb:pages" content="fbpages2"/>')
    })

    test('header helper renders Fragment children', async () => {
      const html = await render('/head')
      expect(html).toContain('<title>Fragment title</title>')
      expect(html).toContain('<meta content="meta fragment"/>')
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
      const html = await render('/url-prop')
      expect(html).not.toContain('"nextExport"')
    })

    test('renders styled jsx', async () => {
      const $ = await get$('/styled-jsx')
      const styleId = $('#blue-box').attr('class')
      const style = $('style')

      expect(style.text().includes(`p.${styleId}{color:blue`)).toBeTruthy()
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
      const $ = await get$('/circular-json-error')
      const expectedErrorMessage =
        'Circular structure in "getInitialProps" result of page "/circular-json-error".'
      expect(
        $('pre')
          .text()
          .includes(expectedErrorMessage)
      ).toBeTruthy()
    })

    test('getInitialProps should be class method', async () => {
      const $ = await get$('/instance-get-initial-props')
      const expectedErrorMessage =
        '"InstanceInitialPropsPage.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.'
      expect(
        $('pre')
          .text()
          .includes(expectedErrorMessage)
      ).toBeTruthy()
    })

    test('getInitialProps resolves to null', async () => {
      const $ = await get$('/empty-get-initial-props')
      const expectedErrorMessage =
        '"EmptyInitialPropsPage.getInitialProps()" should resolve to an object. But found "null" instead.'
      expect(
        $('pre')
          .text()
          .includes(expectedErrorMessage)
      ).toBeTruthy()
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

    test('should expose the compiled page file in development', async () => {
      await fetch('/stateless') // make sure the stateless page is built
      const clientSideJsRes = await fetch(
        '/_next/development/static/development/pages/stateless.js'
      )
      expect(clientSideJsRes.status).toBe(200)
      const clientSideJsBody = await clientSideJsRes.text()
      expect(clientSideJsBody).toMatch(/My component!/)

      const serverSideJsRes = await fetch(
        '/_next/development/server/static/development/pages/stateless.js'
      )
      expect(serverSideJsRes.status).toBe(200)
      const serverSideJsBody = await serverSideJsRes.text()
      expect(serverSideJsBody).toMatch(/My component!/)
    })

    test('allows to import .json files', async () => {
      const html = await render('/json')
      expect(html.includes('Zeit')).toBeTruthy()
    })

    test('default export is not a React Component', async () => {
      const $ = await get$('/no-default-export')
      const pre = $('pre')
      expect(pre.text()).toMatch(/The default export is not a React Component/)
    })

    test('error-inside-page', async () => {
      const $ = await get$('/error-inside-page')
      expect($('pre').text()).toMatch(/This is an expected error/)
      // Sourcemaps are applied by react-error-overlay, so we can't check them on SSR.
    })

    test('error-in-the-global-scope', async () => {
      const $ = await get$('/error-in-the-global-scope')
      expect($('pre').text()).toMatch(/aa is not defined/)
      // Sourcemaps are applied by react-error-overlay, so we can't check them on SSR.
    })

    it('should set Cache-Control header', async () => {
      const buildId = 'development'

      // build dynamic page
      await fetch('/dynamic/ssr')

      const buildManifest = require(join('../.next', BUILD_MANIFEST))
      const reactLoadableManifest = require(join(
        '../.next',
        REACT_LOADABLE_MANIFEST
      ))
      const resources = []

      // test a regular page
      resources.push(`/_next/static/${buildId}/pages/index.js`)

      // test dynamic chunk
      resources.push(
        '/_next/' +
          reactLoadableManifest['../../components/hello1'][0].publicPath
      )

      // test main.js runtime etc
      for (const item of buildManifest.pages['/dynamic/ssr']) {
        resources.push('/_next/' + item)
      }

      for (const item of buildManifest.devFiles) {
        resources.push('/_next/' + item)
      }

      const responses = await Promise.all(
        resources.map(resource => fetch(resource))
      )

      responses.forEach(res => {
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

    describe('Url prop', () => {
      it('should provide pathname, query and asPath', async () => {
        const $ = await get$('/url-prop')
        expect($('#pathname').text()).toBe('/url-prop')
        expect($('#query').text()).toBe('0')
        expect($('#aspath').text()).toBe('/url-prop')
      })

      it('should override props.url, even when getInitialProps returns url as property', async () => {
        const $ = await get$('/url-prop-override')
        expect($('#pathname').text()).toBe('/url-prop-override')
        expect($('#query').text()).toBe('0')
        expect($('#aspath').text()).toBe('/url-prop-override')
      })
    })

    describe('404', () => {
      it('should 404 on not existent page', async () => {
        const $ = await get$('/non-existent')
        expect($('h1').text()).toBe('404')
        expect($('h2').text()).toBe('This page could not be found.')
      })

      it('should 404 for <page>/', async () => {
        const $ = await get$('/nav/about/')
        expect($('h1').text()).toBe('404')
        expect($('h2').text()).toBe('This page could not be found.')
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
      const $ = await get$('/throw-undefined')
      expect($('body').text()).toMatch(
        'An undefined error was thrown sometime during render...'
      )
    })
  })
}
