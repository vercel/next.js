import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Startup preloading is specific to the self-hosted production server.
describe.each([undefined, true, false])(
  'preloadEntriesOnStart: %s',
  (preloadEntriesOnStart) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      nextConfig: {
        experimental: {
          ...(preloadEntriesOnStart === undefined
            ? {}
            : { preloadEntriesOnStart }),
        },
      },
    })

    beforeAll(async () => {
      const { exitCode } = await next.build()
      if (exitCode !== 0) {
        throw new Error(`next build failed with exit code ${exitCode}`)
      }
      // start() clears cliOutput, excluding build-time module evaluation.
      await next.start({ skipBuild: true })
    })

    it('respects the option before the first route handler request', async () => {
      if (preloadEntriesOnStart === false) {
        // A request to another entry must not evaluate the route handler.
        const response = await next.fetch('/control')
        expect(response.status).toBe(200)
        expect(next.cliOutput).not.toContain('preload-test:route-evaluated')
      } else {
        // Preloading is asynchronous. The Pages Router control confirms that
        // the entry preloader is running, without warming the route by HTTP.
        await retry(async () => {
          expect(next.cliOutput).toContain('preload-test:page-evaluated')
        })
        await retry(async () => {
          expect(next.cliOutput).toContain('preload-test:route-evaluated')
        })
      }
    })

    it('serves the route and evaluates its module only once', async () => {
      for (let i = 0; i < 2; i++) {
        const response = await next.fetch('/api/heavy')
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
      }
      await retry(async () => {
        expect(
          next.cliOutput.split('preload-test:route-evaluated').length - 1
        ).toBe(1)
      })
    })
  }
)
