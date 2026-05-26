import { nextTestSetup } from 'e2e-utils'

// The isolated test install for this suite (fresh `pnpm install` of a packed
// Next.js tarball + starting `next dev`) can exceed the default 120s jest
// beforeAll timeout on cold caches.
jest.setTimeout(5 * 60 * 1000)

// Skipped for Turbopack as this test is webpack-specific
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'Handles a broken webpack plugin (precompile)',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should render error correctly', async () => {
      const text = await next.render('/')
      expect(text).toContain('Internal Server Error')
      expect(next.cliOutput).toMatch('Error: oops')
    })
  }
)
