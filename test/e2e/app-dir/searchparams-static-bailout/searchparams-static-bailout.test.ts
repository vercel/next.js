import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'searchparams-static-bailout',
  {
    files: __dirname,
    dependencies: {
      nanoid: '4.0.1',
    },
  },
  ({ next, isNextStart }) => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    it('should work be part of the initial html', async () => {
      const $ = await next.render$('/?search=hello')
      expect($('h1').text()).toBe('Parameter: hello')

      // Check if the page is not statically generated.
      if (isNextStart) {
        const id = $('#nanoid').text()
        const $2 = await next.render$('/?search=hello')
        const id2 = $2('#nanoid').text()
        expect(id).not.toBe(id2)
      }
    })

    it('should work using browser', async () => {
      const browser = await next.browser('/?search=hello')
      expect(await browser.elementByCss('h1').text()).toBe('Parameter: hello')
    })
  }
)
