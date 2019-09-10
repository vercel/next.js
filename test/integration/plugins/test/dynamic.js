/* eslint-env jest */
import cheerio from 'cheerio'

export default (context, render) => {
  async function get$ (path, query) {
    const html = await render(path, query)
    return cheerio.load(html)
  }
  describe('Plugins', () => {
    it('should render dynamic import components', async () => {
      const $ = await get$('/dynamic/ssr')
      // Make sure the client side knows it has to wait for the bundle
      expect($('body').html()).toContain(
        '"dynamicIds":["./components/hello1.js"]'
      )
      expect($('body').text()).toMatch(/Hello World 1/)
    })
  })
}
