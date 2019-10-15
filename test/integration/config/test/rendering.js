/* global test */
import 'testcafe'

import cheerio from 'cheerio'

export default function (render, fetch) {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  test('renders css imports', async t => {
    const $ = await get$('/webpack-css')
    await t.expect($('._46QtCORzC4BWRnIseSbG-').text() === 'Hello World').ok()
  })

  test('renders non-js imports from node_modules', async t => {
    const $ = await get$('/webpack-css')
    await t.expect($('._2pRSkKTPDMGLMnmsEkP__J').text() === 'Hello World').ok()
  })

  test('renders server config on the server only', async t => {
    const $ = await get$('/next-config')
    await t.expect($('#server-only').text() === 'secret').ok()
  })

  test('renders public config on the server only', async t => {
    const $ = await get$('/next-config')
    await t.expect($('#server-and-client').text() === '/static').ok()
  })

  test('renders the build id in development mode', async t => {
    const $ = await get$('/build-id')
    await t.expect($('#buildId').text() === 'development').ok()
  })

  test('correctly imports a package that defines `module` but no `main` in package.json', async t => {
    const $ = await get$('/module-only-content')
    await t
      .expect($('#messageInAPackage').text())
      .contains("I am sometimes found by tooling. I shouldn't be.")
  })
}
