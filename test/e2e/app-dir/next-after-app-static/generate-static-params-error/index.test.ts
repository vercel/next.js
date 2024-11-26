/* eslint-env jest */
import { isNextDev, nextTestSetup } from 'e2e-utils'

// This test relies on next.build() so it can't work in dev mode.
const _describe = isNextDev ? describe.skip : describe

_describe('unstable_after() in generateStaticParams - thrown errors', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true, // can't access build errors in deploy tests
  })

  if (skipped) return

  it('fails the build if an error is thrown inside unstable_after', async () => {
    const buildResult = await next.build()
    expect(buildResult?.exitCode).toBe(1)

    {
      const path = '/callback/[myParam]'
      expect(next.cliOutput).toContain(
        `Failed to collect page data for ${path}`
      )
      expect(next.cliOutput).toContain(
        `My cool error thrown inside unstable_after on route "${path}"`
      )
    }
  })
})
