/* global describe, test, expect */

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
    })

    describe('_app', () => {
      test('It shows a custom tag', async () => {
        const $ = await get$('/')
        expect($('hello-app').text() === 'Hello App')
      })
    })
  })
}
