import { nextTestSetup } from 'e2e-utils'

// Each case names a fixture that occupies a pathname routing reserves, and the
// part of the build error that names the offending file or route. The pathname
// is where routing sends a request that a client tried to name a combination
// for, so content there would answer such a request.
const cases: ReadonlyArray<readonly [fixture: string, expected: string]> = [
  [
    'reserved-route',
    'The path "/__variants/not-routed" from app/%5F_variants/not-routed/page.tsx is reserved by `experimental.variants`.',
  ],
  [
    'reserved-static-param',
    'The path "/__variants/not-routed" from the static params of "/[...slug]" is reserved by `experimental.variants`.',
  ],
  [
    'reserved-public',
    'The public directory has an entry at "/__variants", which is reserved by `experimental.variants`.',
  ],
]

// Only a build reads every route and the public directory, so these are
// production-only. Variants are supported with Turbopack only.
// @force-gate turbopack && !dev
describe('a build occupying a path reserved by Variants', () => {
  for (const [fixture, expected] of cases) {
    describe(fixture, () => {
      const { next, skipped } = nextTestSetup({
        files: __dirname + `/fixtures/${fixture}`,
        // The build is expected to fail, so nothing can start or deploy.
        skipStart: true,
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      it('should fail the build and name the conflict', async () => {
        const { exitCode, cliOutput } = await next.build()

        expect(exitCode).toBe(1)
        expect(cliOutput).toContain(expected)
      })
    })
  }
})
