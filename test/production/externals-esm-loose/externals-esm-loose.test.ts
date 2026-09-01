import { nextTestSetup } from 'e2e-utils'

describe("Handle ESM externals with esmExternals: 'loose'", () => {
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'production mode',
    () => {
      const { next, isNextStart } = nextTestSetup({
        files: __dirname,
      })

      if (!isNextStart) {
        it('skipped for non-start mode', () => {})
        return
      }

      const expected =
        /Hello <!-- -->World<!-- -->\+<!-- -->World<!-- -->\+<!-- -->World/

      it('should render the static page', async () => {
        const html = await next.render('/static')
        expect(html).toMatch(expected)
      })

      it('should render the ssr page', async () => {
        const html = await next.render('/ssr')
        expect(html).toMatch(expected)
      })

      it('should render the ssg page', async () => {
        const html = await next.render('/ssg')
        expect(html).toMatch(expected)
      })
    }
  )
})
