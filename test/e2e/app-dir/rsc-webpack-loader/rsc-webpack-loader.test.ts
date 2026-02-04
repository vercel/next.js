import { nextTestSetup } from 'e2e-utils'

// Skip as Turbopack doesn't support the `!=!` Webpack syntax
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'app dir - rsc webpack loader',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        'styled-components': 'latest',
        'server-only': 'latest',
      },
      resolutions: {
        '@babel/core': '7.22.18',
        '@babel/parser': '7.22.16',
        '@babel/types': '7.22.17',
        '@babel/traverse': '7.22.18',
      },
    })

    it('should support webpack loader rules', async () => {
      const browser = await next.browser('/loader-rule')

      expect(
        await browser.eval(
          `window.getComputedStyle(document.querySelector('#red')).color`
        )
      ).toBe('rgb(255, 0, 0)')
    })
  }
)
