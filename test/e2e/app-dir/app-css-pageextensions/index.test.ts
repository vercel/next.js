import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Re-enable this suite in deploy mode.
// No deploy-specific incompatibility is documented.
// @force-gate !deploy
describe('app dir - css with pageextensions', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@picocss/pico': '1.5.7',
      sass: 'latest',
    },
  })

  describe('css support with pageextensions', () => {
    describe('page in app directory with pageextention, css should work', () => {
      it('should support global css inside layout', async () => {
        const browser = await next.browser('/css-pageextensions')
        expect(
          await browser.eval(
            `window.getComputedStyle(document.querySelector('h1')).color`
          )
        ).toBe('rgb(255, 0, 0)')
      })
    })
  })
})
