import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const rejection =
  'Variants require the `experimental.variants` option to be enabled in your Next.js config.'

// Variants are supported with Turbopack only, and a webpack run rejects the
// config before it reaches the check this asserts.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'variants with the flag off',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/flag-off',
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('should reject a variant defined without the flag', async () => {
      if (isNextDev) {
        // Dev compiles a route when a client requests it. Defining the variant
        // therefore fails that request, and not a build.
        await next.start()

        const response = await next.fetch('/')

        expect(response.status).toBe(500)

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
