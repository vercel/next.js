/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import { check, File, waitFor } from 'next-test-utils'

export default function ({ app }, suiteName, render, fetch) {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe(suiteName, () => {
    describe('_document', () => {
      test('It has a custom html class', async () => {
        const $ = await get$('/')
        expect($('html').hasClass('test-html-props'))
      })

      test('It has a custom body class', async () => {
        const $ = await get$('/')
        expect($('body').hasClass('custom_class'))
      })

      test('It injects custom head tags', async () => {
        const $ = await get$('/')
        expect($('head').text().includes('body { margin: 0 }'))
      })

      test('It passes props from Document.getInitialProps to Document', async () => {
        const $ = await get$('/')
        expect($('#custom-property').text() === 'Hello Document')
      })

      test('It adds nonces to all scripts and preload links', async () => {
        const $ = await get$('/')
        const nonce = 'test-nonce'
        let noncesAdded = true
        $('script, link[rel=preload]').each((index, element) => {
          if ($(element).attr('nonce') !== nonce) noncesAdded = false
        })
        expect(noncesAdded).toBe(true)
      })

      test('It adds crossOrigin to all scripts and preload links', async () => {
        const $ = await get$('/')
        const crossOrigin = 'anonymous'
        $('script, link[rel=preload]').each((index, element) => {
          expect($(element).attr('crossorigin') === crossOrigin).toBeTruthy()
        })
      })

      test('It renders ctx.renderPage with enhancer correctly', async () => {
        const $ = await get$('/?withEnhancer=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-component').text().includes(nonce)).toBe(true)
      })

      test('It renders ctx.renderPage with enhanceComponent correctly', async () => {
        const $ = await get$('/?withEnhanceComponent=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-component').text().includes(nonce)).toBe(true)
      })

      test('It renders ctx.renderPage with enhanceApp correctly', async () => {
        const $ = await get$('/?withEnhanceApp=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-app').text().includes(nonce)).toBe(true)
      })

      test('It renders ctx.renderPage with enhanceApp and enhanceComponent correctly', async () => {
        const $ = await get$('/?withEnhanceComponent=true&withEnhanceApp=true')
        const nonce = 'RENDERED'
        expect($('#render-page-enhance-app').text().includes(nonce)).toBe(true)
        expect($('#render-page-enhance-component').text().includes(nonce)).toBe(true)
      })

      // This is a workaround to fix https://github.com/zeit/next.js/issues/5860
      // TODO: remove this workaround when https://bugs.webkit.org/show_bug.cgi?id=187726 is fixed.
      test('It adds a timestamp to link tags with preload attribute to invalidate the cache (DEV only)', async () => {
        const $ = await get$('/')
        $('link[rel=preload]').each((index, element) => {
          const href = $(element).attr('href')
          expect(href.match(/\?/g)).toHaveLength(1)
          expect(href).toMatch(/\?ts=/)
        })
        $('script[src]').each((index, element) => {
          const src = $(element).attr('src')
          expect(src.match(/\?/g)).toHaveLength(1)
          expect(src).toMatch(/\?ts=/)
        })
      })
    })

    describe('_app', () => {
      test('It shows a custom tag', async () => {
        const $ = await get$('/')
        expect($('hello-app').text() === 'Hello App')
      })

      // For example react context uses shared module state
      // Also known as singleton modules
      test('It should share module state with pages', async () => {
        const $ = await get$('/shared')
        expect($('#currentstate').text() === 'UPDATED')
      })

      test('It should show valid error when thrown in _app getInitialProps', async () => {
        const errMsg = 'have an error from _app getInitialProps'
        const _app = new File(join(__dirname, '../pages/_app.js'))

        let foundErr = false
        expect(await render('/')).toMatch('page-index')
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
          await check(
            () => render('/'),
            /page-index/
          )
          expect(foundErr).toBeTruthy()
        }
      })
    })
  })
}
