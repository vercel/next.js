/* eslint-env jest */

import cheerio from 'cheerio'

export default function({ app }, suiteName, render) {
  async function get$(path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe(suiteName, () => {
    test('renders css imports', async () => {
      const $ = await get$('/webpack-css')
      console.log($.html())
      expect($('._46QtCORzC4BWRnIseSbG-').text()).toBe('Hello World')
    })

    test('renders non-js imports from node_modules', async () => {
      const $ = await get$('/webpack-css')
      console.log($.html())
      expect($('._2pRSkKTPDMGLMnmsEkP__J').text()).toBe('Hello World')
    })

    test('renders server config on the server only', async () => {
      const $ = await get$('/next-config')
      expect($('#server-only').text()).toBe('secret')
    })

    test('renders public config on the server only', async () => {
      const $ = await get$('/next-config')
      expect($('#server-and-client').text()).toBe('/static')
    })

    test('renders the build id in development mode', async () => {
      const $ = await get$('/build-id')
      expect($('#buildId').text()).toBe('development')
    })

    test('correctly imports a package that defines `module` but no `main` in package.json', async () => {
      const $ = await get$('/module-only-content')
      expect($('#messageInAPackage').text()).toBe('OK')
    })
  })
}
