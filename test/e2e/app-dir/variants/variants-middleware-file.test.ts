import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const expectedError =
  '`experimental.variants` is not supported in the Middleware file at "./middleware.ts". Rename it to a Proxy file, which always runs on the Node.js runtime.'

// Variants are supported with Turbopack only, so a webpack build rejects the
// config of this fixture before it reads the middleware file.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'variants in a middleware file',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname + '/fixtures/middleware-file',
      // The fixture exists to fail, so the harness must not build or start it.
      // Both modes below drive Next.js by hand instead.
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    if (isNextDev) {
      beforeAll(async () => {
        await next.start()
      })

      it('should report the middleware file and keep the dev server up', async () => {
        // Renaming the file has to recover without a restart, so the dev server
        // reports the error and carries on rather than failing the route.
        const response = await next.fetch('/')

        expect(response.status).toBe(200)

        await retry(async () => {
          expect(next.cliOutput).toContain(expectedError)
        })
      })
    } else {
      it('should fail the build', async () => {
        const { exitCode, cliOutput } = await next.build()

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(expectedError)
      })
    }
  }
)
