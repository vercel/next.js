import { nextTestSetup } from 'e2e-utils'

describe('experimental-lightningcss with default mode', () => {
  describe('in dev server', () => {
    const { isTurbopack, next } = nextTestSetup({
      files: __dirname,
      dependencies: { lightningcss: '^1.23.0' },
      packageJson: {
        browserslist: ['chrome 100'],
      },
    })

    it('should support css modules', async () => {
      // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')

      // lightningcss produces different class names in turbo mode
      if (isTurbopack) {
        // swc_css does not include `-module` in the class name, while lightningcss does.
        expect($('p').attr('class')).toBe(
          'search-keyword style-module__hlQ3RG__blue'
        )
      } else {
        // We remove hash from the class name in test mode using env var because it is not deterministic.
        expect($('p').attr('class')).toBe('search-keyword style-module__blue')
      }
    })

    it('should support browserslist', async () => {
      const $ = await next.browser('/')

      expect(await $.elementByCss('.nested').text()).toBe('Red due to nesting')
      expect(await $.elementByCss('.nested').getComputedCss('color')).toBe(
        'rgb(255, 0, 0)'
      )
    })
  })
})
