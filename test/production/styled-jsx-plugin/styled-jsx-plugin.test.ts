import { nextTestSetup } from 'e2e-utils'

// This test uses a custom babelrc, which Turbopack does not support.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'styled-jsx-plugin',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        lost: '8.2.0',
        'postcss-nested': '2.1.2',
        'styled-jsx-plugin-postcss': '0.1.0',
      },
    })

    it('should serve a page correctly', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello World')
    })
  }
)
