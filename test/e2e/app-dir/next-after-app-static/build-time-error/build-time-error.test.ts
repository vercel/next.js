/* eslint-env jest */
import { isNextDev, nextTestSetup } from 'e2e-utils'

// This test relies on next.build() so it can't work in dev mode.
const _describe = isNextDev ? describe.skip : describe

_describe('after() in static pages - thrown errors', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true, // can't access build errors in deploy tests
  })

  if (skipped) return

  it('fails the build if an error is thrown inside after', async () => {
    const buildResult = await next.build()
    expect(buildResult?.exitCode).toBe(1)

    {
      const path = '/page-throws-in-after/callback'
      expect(next.cliOutput).toContain(
        `Error occurred prerendering page "${path}"`
      )
      expect(next.cliOutput).toContain(
        `My cool error thrown inside after on route "${path}"`
      )
    }

    {
      const path = '/page-throws-in-after/promise'
      expect(next.cliOutput).toContain(
        `Error occurred prerendering page "${path}"`
      )
      expect(next.cliOutput).toContain(
        `My cool error thrown inside after on route "${path}"`
      )
    }

    {
      const path = '/route-throws-in-after/callback'
      expect(next.cliOutput).toContain(
        `Error occurred prerendering page "${path}"`
      )
      expect(next.cliOutput).toContain(
        `My cool error thrown inside after on route "${path}"`
      )
    }

    {
      const path = '/route-throws-in-after/promise'
      expect(next.cliOutput).toContain(
        `Error occurred prerendering page "${path}"`
      )
      expect(next.cliOutput).toContain(
        `My cool error thrown inside after on route "${path}"`
      )
    }
  })
})
