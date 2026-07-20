import { nextTestSetup } from 'e2e-utils'

// Babel-specific feature, not supported in Turbopack
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'TypeScript onlyRemoveTypeImports',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should render a normal page correctly', async () => {
      const html = await next.render('/normal')
      expect(html).toContain('A normal one')
    })

    it('should render a page with type import correctly', async () => {
      const html = await next.render('/')
      expect(html).toContain('anton')
      expect(html).toContain('berta')
    })
  }
)
