/* eslint-env jest */

import cheerio from 'cheerio'

export default function ({ app }, suiteName, render, fetch) {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe(suiteName, () => {
    test('renders css imports', async () => {
      const $ = await get$('/webpack-css')
      expect($('._46QtCORzC4BWRnIseSbG-').text() === 'Hello World')
    })

    test('renders non-js imports from node_modules', async () => {
      const $ = await get$('/webpack-css')
      expect($('._2pRSkKTPDMGLMnmsEkP__J').text() === 'Hello World')
    })

    test('renders server config on the server only', async () => {
      const $ = await get$('/next-config')
      expect($('#server-only').text() === 'mySecret')
    })

    test('renders public config on the server only', async () => {
      const $ = await get$('/next-config')
      expect($('#server-and-client').text() === '/static')
    })

    test('renders the build id in development mode', async () => {
      const $ = await get$('/build-id')
      expect($('#buildId').text() === '-')
    })
  })
}
