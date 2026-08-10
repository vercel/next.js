import { nextTestSetup } from 'e2e-utils'

// This isolated test installs extra dependencies (`lost`, `postcss-nested`,
// `styled-jsx-plugin-postcss`) and a custom .babelrc.js disables SWC, which
// makes the isolated install + `next build` much slower than the default 120s
// jest beforeAll timeout.
jest.setTimeout(10 * 60 * 1000)

// This test uses a custom babelrc, which Turbopack does not support.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'styled-jsx-plugin',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        // Use versions compatible with postcss 8. Older pinned versions
        // (`lost@8`, `postcss-nested@2`, `styled-jsx-plugin-postcss@0.1`)
        // depend on postcss 6 and a `deasync` native addon that deadlocks
        // inside Next.js's webpack build worker on modern Node.js.
        lost: '9.0.2',
        'postcss-nested': '7.0.2',
        'styled-jsx-plugin-postcss': '4.0.1',
      },
    })

    it('should serve a page correctly', async () => {
      const html = await next.render('/')
      expect(html).toContain('Hello World')
    })
  }
)
