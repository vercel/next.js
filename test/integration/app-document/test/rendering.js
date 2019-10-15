/* global test */
import 'testcafe'
import { join } from 'path'
import cheerio from 'cheerio'
import { check, File, waitFor } from 'next-test-utils'

export default render => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  test('It has a custom html class', async t => {
    const $ = await get$('/')
    await t.expect($('html').hasClass('test-html-props')).ok()
  })

  test('It has a custom body class', async t => {
    const $ = await get$('/')
    await t.expect($('body').hasClass('custom_class')).ok()
  })

  test('It injects custom head tags', async t => {
    const $ = await get$('/')
    await t
      .expect(
        $('head')
          .text()
          .includes('body { margin: 0 }')
      )
      .ok()
  })

  test('It passes props from Document.getInitialProps to Document', async t => {
    const $ = await get$('/')
    await t.expect($('#custom-property').text() === 'Hello Document').ok()
  })

  test('It adds nonces to all scripts and preload links', async t => {
    const $ = await get$('/')
    const nonce = 'test-nonce'
    let noncesAdded = true
    $('script, link[rel=preload]').each((index, element) => {
      if ($(element).attr('nonce') !== nonce) noncesAdded = false
    })
    await t.expect(noncesAdded).eql(true)
  })

  test('It adds crossOrigin to all scripts and preload links', async t => {
    const $ = await get$('/')
    const crossOrigin = 'anonymous'
    await Promise.all(
      Array.from($('script, link[rel=preload]')).map(async el => {
        await t.expect($(el).attr('crossorigin') === crossOrigin).ok()
      })
    )
  })

  test('It renders ctx.renderPage with enhancer correctly', async t => {
    const $ = await get$('/?withEnhancer=true')
    const nonce = 'RENDERED'
    await t
      .expect(
        $('#render-page-enhance-component')
          .text()
          .includes(nonce)
      )
      .eql(true)
  })

  test('It renders ctx.renderPage with enhanceComponent correctly', async t => {
    const $ = await get$('/?withEnhanceComponent=true')
    const nonce = 'RENDERED'
    await t
      .expect(
        $('#render-page-enhance-component')
          .text()
          .includes(nonce)
      )
      .eql(true)
  })

  test('It renders ctx.renderPage with enhanceApp correctly', async t => {
    const $ = await get$('/?withEnhanceApp=true')
    const nonce = 'RENDERED'
    await t
      .expect(
        $('#render-page-enhance-app')
          .text()
          .includes(nonce)
      )
      .eql(true)
  })

  test('It renders ctx.renderPage with enhanceApp and enhanceComponent correctly', async t => {
    const $ = await get$('/?withEnhanceComponent=true&withEnhanceApp=true')
    const nonce = 'RENDERED'
    await t
      .expect(
        $('#render-page-enhance-app')
          .text()
          .includes(nonce)
      )
      .eql(true)
    await t
      .expect(
        $('#render-page-enhance-component')
          .text()
          .includes(nonce)
      )
      .eql(true)
  })

  // This is a workaround to fix https://github.com/zeit/next.js/issues/5860
  // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
  test('It adds a timestamp to link tags with preload attribute to invalidate the cache (DEV only)', async t => {
    const $ = await get$('/')
    await Promise.all(
      Array.from($('link[rel=preload]')).map(async el => {
        const href = $(el).attr('href')
        await t.expect(href.match(/\?/g).length).eql(1)
        await t.expect(href).match(/\?ts=/)
      })
    )
    await Promise.all(
      Array.from($('script[src]')).map(async el => {
        const src = $(el).attr('src')
        await t.expect(src.match(/\?/g).length).eql(1)
        await t.expect(src).match(/\?ts=/)
      })
    )
  })

  test('It shows a custom tag', async t => {
    const $ = await get$('/')
    await t.expect($('#hello-app').text() === 'Hello App').ok()
  })

  // For example react context uses shared module state
  // Also known as singleton modules
  test('It should share module state with pages', async t => {
    const $ = await get$('/shared')
    await t.expect($('#currentstate').text() === 'UPDATED').ok()
  })

  test('It should show valid error when thrown in _app getInitialProps', async t => {
    const errMsg = 'have an error from _app getInitialProps'
    const _app = new File(join(__dirname, '../pages/_app.js'))

    let foundErr = false
    await t.expect(await render('/')).match(/page-index/)
    _app.replace('// throw _app GIP err here', `throw new Error("${errMsg}")`)

    try {
      let tries = 0
      while (!foundErr && tries < 5) {
        foundErr = (await render('/')).indexOf(errMsg) > -1
        await waitFor(1000)
        tries++
      }
    } finally {
      _app.restore()
      // Make sure _app is restored
      await check(() => render('/'), /page-index/)
      await t.expect(foundErr).ok()
    }
  })
}
