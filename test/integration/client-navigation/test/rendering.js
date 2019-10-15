/* global test */
import 'testcafe'

import { join } from 'path'
import cheerio from 'cheerio'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST } from 'next/constants'

export default function (render, fetch) {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  test('renders a stateless component', async t => {
    const html = await render('/stateless')
    await t.expect(html.includes('<meta charSet="utf-8"/>')).ok()
    await t.expect(html.includes('My component!')).ok()
  })

  test('renders with fragment syntax', async t => {
    const html = await render('/fragment-syntax')
    await t.expect(html.includes('My component!')).ok()
  })

  test('renders when component is a forwardRef instance', async t => {
    const html = await render('/forwardRef-component')
    await t
      .expect(html.includes('This is a component with a forwarded ref'))
      .ok()
  })

  test('renders when component is a memo instance', async t => {
    const html = await render('/memo-component')
    await t.expect(html.includes('Memo component')).ok()
  })

  // default-head contains an empty <Head />.
  test('header renders default charset', async t => {
    const html = await render('/default-head')
    await t.expect(html.includes('<meta charSet="utf-8"/>')).ok()
    await t.expect(html.includes('next-head, but only once.')).ok()
  })

  test('header renders default viewport', async t => {
    const html = await render('/default-head')
    await t
      .expect(html)
      .contains(
        '<meta name="viewport" content="width=device-width,minimum-scale=1,initial-scale=1"/>'
      )
  })

  test('header helper renders header information', async t => {
    const html = await render('/head')
    await t.expect(html.includes('<meta charSet="iso-8859-5"/>')).ok()
    await t.expect(html.includes('<meta content="my meta"/>')).ok()
    await t
      .expect(html)
      .contains(
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
      )
    await t.expect(html.includes('I can have meta tags')).ok()
  })

  test('header helper dedupes tags', async t => {
    const html = await render('/head')
    await t.expect(html).contains('<meta charSet="iso-8859-5"/>')
    await t.expect(html).notContains('<meta charSet="utf-8"/>')
    await t
      .expect(html)
      .contains(
        '<meta name="viewport" content="width=device-width,initial-scale=1"/>'
      )
    await t
      .expect(html.match(/<meta name="viewport" /g).length)
      .eql(1, 'Should contain only one viewport')
    await t
      .expect(html)
      .notContains('<meta name="viewport" content="width=device-width"/>')
    await t.expect(html).contains('<meta content="my meta"/>')
    await t
      .expect(html)
      .contains(
        '<link rel="stylesheet" href="/dup-style.css"/><link rel="stylesheet" href="/dup-style.css"/>'
      )
    await t
      .expect(html)
      .contains('<link rel="stylesheet" href="dedupe-style.css"/>')
    await t
      .expect(html)
      .notContains(
        '<link rel="stylesheet" href="dedupe-style.css"/><link rel="stylesheet" href="dedupe-style.css"/>'
      )
  })

  test('header helper avoids dedupe of specific tags', async t => {
    const html = await render('/head')
    await t
      .expect(html)
      .contains('<meta property="article:tag" content="tag1"/>')
    await t
      .expect(html)
      .contains('<meta property="article:tag" content="tag2"/>')
    await t
      .expect(html)
      .notContains('<meta property="dedupe:tag" content="tag3"/>')
    await t
      .expect(html)
      .contains('<meta property="dedupe:tag" content="tag4"/>')
    await t
      .expect(html)
      .contains('<meta property="og:image" content="ogImageTag1"/>')
    await t
      .expect(html)
      .contains('<meta property="og:image" content="ogImageTag2"/>')
    await t
      .expect(html)
      .contains('<meta property="og:image:alt" content="ogImageAltTag1"/>')
    await t
      .expect(html)
      .contains('<meta property="og:image:alt" content="ogImageAltTag2"/>')
    await t
      .expect(html)
      .contains('<meta property="og:image:width" content="ogImageWidthTag1"/>')
    await t
      .expect(html)
      .contains('<meta property="og:image:width" content="ogImageWidthTag2"/>')
    await t
      .expect(html)
      .contains(
        '<meta property="og:image:height" content="ogImageHeightTag1"/>'
      )
    await t
      .expect(html)
      .contains(
        '<meta property="og:image:height" content="ogImageHeightTag2"/>'
      )
    await t
      .expect(html)
      .contains('<meta property="og:image:type" content="ogImageTypeTag1"/>')
    await t
      .expect(html)
      .contains('<meta property="og:image:type" content="ogImageTypeTag2"/>')
    await t
      .expect(html)
      .contains(
        '<meta property="og:image:secure_url" content="ogImageSecureUrlTag1"/>'
      )
    await t
      .expect(html)
      .contains(
        '<meta property="og:image:secure_url" content="ogImageSecureUrlTag2"/>'
      )
    await t
      .expect(html)
      .contains('<meta property="og:image:url" content="ogImageUrlTag1"/>')
    await t
      .expect(html)
      .contains('<meta property="fb:pages" content="fbpages1"/>')
    await t
      .expect(html)
      .contains('<meta property="fb:pages" content="fbpages2"/>')
  })

  test('header helper renders Fragment children', async t => {
    const html = await render('/head')
    await t.expect(html).contains('<title>Fragment title</title>')
    await t.expect(html).contains('<meta content="meta fragment"/>')
  })

  test('should render the page with custom extension', async t => {
    const html = await render('/custom-extension')
    await t.expect(html).contains('<div>Hello</div>')
    await t.expect(html).contains('<div>World</div>')
  })

  test('should render the page without `err` property', async t => {
    const html = await render('/')
    await t.expect(html).notContains('"err"')
  })

  test('should render the page with `nextExport` property', async t => {
    const html = await render('/')
    await t.expect(html).contains('"nextExport"')
  })

  test('should render the page without `nextExport` property', async t => {
    const html = await render('/url-prop')
    await t.expect(html).notContains('"nextExport"')
  })

  test('renders styled jsx', async t => {
    const $ = await get$('/styled-jsx')
    const styleId = $('#blue-box').attr('class')
    const style = $('style')

    await t.expect(style.text().includes(`p.${styleId}{color:blue`)).ok()
  })

  test('renders properties populated asynchronously', async t => {
    const html = await render('/async-props')
    await t.expect(html.includes('Diego Milito')).ok()
  })

  test('renders a link component', async t => {
    const $ = await get$('/link')
    const link = $('a[href="/about"]')
    await t.expect(link.text()).eql('About')
  })

  test('getInitialProps circular structure', async t => {
    const $ = await get$('/circular-json-error')
    const expectedErrorMessage =
      'Circular structure in "getInitialProps" result of page "/circular-json-error".'
    await t
      .expect(
        $('pre')
          .text()
          .includes(expectedErrorMessage)
      )
      .ok()
  })

  test('getInitialProps should be class method', async t => {
    const $ = await get$('/instance-get-initial-props')
    const expectedErrorMessage =
      '"InstanceInitialPropsPage.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-initial-props-as-an-instance-method for more information.'
    await t
      .expect(
        $('pre')
          .text()
          .includes(expectedErrorMessage)
      )
      .ok()
  })

  test('getInitialProps resolves to null', async t => {
    const $ = await get$('/empty-get-initial-props')
    const expectedErrorMessage =
      '"EmptyInitialPropsPage.getInitialProps()" should resolve to an object. But found "null" instead.'
    await t
      .expect(
        $('pre')
          .text()
          .includes(expectedErrorMessage)
      )
      .ok()
  })

  test('default Content-Type', async t => {
    const res = await fetch('/stateless')
    await t
      .expect(res.headers.get('Content-Type'))
      .contains('text/html; charset=utf-8')
  })

  test('setting Content-Type in getInitialProps', async t => {
    const res = await fetch('/custom-encoding')
    await t
      .expect(res.headers.get('Content-Type'))
      .contains('text/html; charset=iso-8859-2')
  })

  test('should render 404 for _next routes that do not exist', async t => {
    const res = await fetch('/_next/abcdef')
    await t.expect(res.status).eql(404)
  })

  test('should render page that has module.exports anywhere', async t => {
    const res = await fetch('/exports')
    await t.expect(res.status).eql(200)
  })

  test('should expose the compiled page file in development', async t => {
    await fetch('/stateless') // make sure the stateless page is built
    const clientSideJsRes = await fetch(
      '/_next/development/static/development/pages/stateless.js'
    )
    await t.expect(clientSideJsRes.status).eql(200)
    const clientSideJsBody = await clientSideJsRes.text()
    await t.expect(clientSideJsBody).match(/My component!/)

    const serverSideJsRes = await fetch(
      '/_next/development/server/static/development/pages/stateless.js'
    )
    await t.expect(serverSideJsRes.status).eql(200)
    const serverSideJsBody = await serverSideJsRes.text()
    await t.expect(serverSideJsBody).match(/My component!/)
  })

  test('allows to import .json files', async t => {
    const html = await render('/json')
    await t.expect(html.includes('Zeit')).ok()
  })

  test('default export is not a React Component', async t => {
    const $ = await get$('/no-default-export')
    const pre = $('pre')
    await t
      .expect(pre.text())
      .match(/The default export is not a React Component/)
  })

  test('error-inside-page', async t => {
    const $ = await get$('/error-inside-page')
    await t.expect($('pre').text()).match(/This is an expected error/)
    // Sourcemaps are applied by react-error-overlay, so we can't check them on SSR.
  })

  test('error-in-the-global-scope', async t => {
    const $ = await get$('/error-in-the-global-scope')
    await t.expect($('pre').text()).match(/aa is not defined/)
    // Sourcemaps are applied by react-error-overlay, so we can't check them on SSR.
  })

  test('should set Cache-Control header', async t => {
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
      '/_next/' + reactLoadableManifest['../../components/hello1'][0].publicPath
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

    await Promise.all(
      responses.map(async res => {
        try {
          await t
            .expect(res.headers.get('Cache-Control'))
            .eql('no-store, must-revalidate')
        } catch (err) {
          err.message = res.url + ' ' + err.message
          throw err
        }
      })
    )
  })

  test('asPath', async t => {
    const $ = await get$('/nav/as-path', { aa: 10 })
    await t.expect($('.as-path-content').text()).eql('/nav/as-path?aa=10')
  })

  test('should provide pathname, query and asPath', async t => {
    const $ = await get$('/url-prop')
    await t.expect($('#pathname').text()).eql('/url-prop')
    await t.expect($('#query').text()).eql('0')
    await t.expect($('#aspath').text()).eql('/url-prop')
  })

  test('should override props.url, even when getInitialProps returns url as property', async t => {
    const $ = await get$('/url-prop-override')
    await t.expect($('#pathname').text()).eql('/url-prop-override')
    await t.expect($('#query').text()).eql('0')
    await t.expect($('#aspath').text()).eql('/url-prop-override')
  })

  test('should 404 on not existent page', async t => {
    const $ = await get$('/non-existent')
    await t.expect($('h1').text()).eql('404')
    await t.expect($('h2').text()).eql('This page could not be found.')
  })

  test('should 404 for <page>/', async t => {
    const $ = await get$('/nav/about/')
    await t.expect($('h1').text()).eql('404')
    await t.expect($('h2').text()).eql('This page could not be found.')
  })

  test('should should not contain a page script in a 404 page', async t => {
    const $ = await get$('/non-existent')
    $('script[src]').each((index, element) => {
      const src = $(element).attr('src')
      if (src.includes('/non-existent')) {
        throw new Error('Page includes page script')
      }
    })
  })

  test('should navigate as expected', async t => {
    const $ = await get$('/nav/with-hoc')

    await t.expect($('#pathname').text()).eql('Current path: /nav/with-hoc')
  })

  test('should include asPath', async t => {
    const $ = await get$('/nav/with-hoc')

    await t.expect($('#asPath').text()).eql('Current asPath: /nav/with-hoc')
  })

  test('should show a valid error when undefined is thrown', async t => {
    const $ = await get$('/throw-undefined')
    await t
      .expect($('body').text())
      .contains('An undefined error was thrown sometime during render...')
  })
}
