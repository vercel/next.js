import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The lazy edge-variant compilation of the instrumentation hook is
// Turbopack-specific (https://github.com/vercel/next.js/issues/86479).
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'instrumentation-hook-node-apis',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })

    it('should not report edge-runtime issues when there is no edge consumer', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('hello world')

      await retry(() => {
        expect(next.cliOutput).toContain(
          'instrumentation hook registered (nodejs)'
        )
      })

      expect(next.cliOutput).not.toContain('Ecmascript file had an error')
      expect(next.cliOutput).not.toContain('Edge Runtime')
    })
  }
)
