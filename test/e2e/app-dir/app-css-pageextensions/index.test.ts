import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - css with pageextensions',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      '@picocss/pico': '1.5.7',
      react: 'latest',
      'react-dom': 'latest',
      sass: 'latest',
    },
  },
  ({ next }) => {
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
  }
)
