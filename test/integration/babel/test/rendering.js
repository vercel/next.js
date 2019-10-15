/* global test */
import 'testcafe'

import cheerio from 'cheerio'

export default function (render, fetch) {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  test('Should compile a page with flowtype correctly', async t => {
    const $ = await get$('/')
    await t.expect($('#text').text()).eql('Test Babel')
  })
}
