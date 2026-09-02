/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'

// This suite intentionally exercises a failed local build.
// @force-gate !dev
// @force-gate !deploy
describe('after() in static pages - thrown errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

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
