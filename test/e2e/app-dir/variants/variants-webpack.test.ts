import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const rejection = '`experimental.variants` is only supported with Turbopack.'

// This suite is the inverse of the other variants suites. It asserts that the
// config is rejected under a bundler the feature does not support, so it runs
// under webpack only.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
  'variants with webpack',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/default',
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('should reject the config', async () => {
      if (isNextDev) {
        // A dev server reports readiness before the config load that rejects
        // it, so the start itself succeeds. The rejection reaches the output,
        // and the server then serves nothing.
        await next.start()

        await retry(async () => {
          expect(next.cliOutput).toContain(rejection)
        })
      } else {
        const { exitCode, cliOutput } = await next.build()

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(rejection)
      }
    })
  }
)
