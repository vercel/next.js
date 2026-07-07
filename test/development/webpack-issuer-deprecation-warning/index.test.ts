import { nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

// Skip on Turbopack because it's not supported
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'webpack-issuer-deprecation-warning',
  () => {
    const { next } = nextTestSetup({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world
          } 
        `,
      },
      dependencies: {},
    })

    it('should not appear deprecation warning about webpack module issuer', async () => {
      const html = await renderViaHTTP(next.url, '/')
      expect(html).toContain('Syntax Error')
      expect(next.cliOutput).not.toContain(
        '[DEP_WEBPACK_MODULE_ISSUER] DeprecationWarning: Module.issuer: Use new ModuleGraph API'
      )
    })
  }
)
