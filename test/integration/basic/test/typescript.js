/* eslint-env jest */
import cheerio from 'cheerio'

export default (context, render) => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  describe('Typescript', () => {
    describe('default behavior', () => {
      it('should render the page', async () => {
        const $ = await get$('/typescript/hello')
        expect($('body').text()).toMatch(/Hello World/)
      })
    })
  })
}
