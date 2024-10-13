/* eslint-env jest */
import { isNextDev, nextTestSetup } from 'e2e-utils'

// This test relies on next.build() so it can't work in dev mode.
const _describe = isNextDev ? describe.skip : describe

_describe('unstable_after() in static pages - thrown errors', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true, // can't access build errors in deploy tests
  })

  if (skipped) return

  it('fails the build if an error is thrown inside unstable_after', async () => {
    const buildResult = await next.build()
    expect(buildResult?.exitCode).toBe(1)

    expect(next.cliOutput).toContain(
      'Error thrown from unstable_after: /page-throws-in-after'
    )
    expect(next.cliOutput).toContain(
      'Error thrown from unstable_after: /route-throws-in-after'
    )
  })
})
