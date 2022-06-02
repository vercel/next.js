/* eslint-env jest */

import cheerio from 'cheerio'

export default function ({ app }, suiteName, render, fetch) {
  async function get$(path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }

  describe(suiteName, () => {
    it('Should compile a page with flowtype correctly', async () => {
      const $ = await get$('/')
      expect($('#text').text()).toBe('Test Babel')
    })
  })
}
