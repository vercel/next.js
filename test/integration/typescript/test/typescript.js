/* eslint-env jest */
import cheerio from 'cheerio'

export default (context, render) => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  describe('TypeScript', () => {
    describe('default behavior', () => {
      it('should render the page', async () => {
        const $ = await get$('/hello')
        expect($('body').text()).toMatch(/Hello World/)
      })
    })
  })
}
