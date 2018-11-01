/* eslint-env jest */

import cheerio from 'cheerio'

export default function ({ app }, suiteName, render, fetch) {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe(suiteName, () => {
    describe('_document', () => {
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
    })
  })
}
