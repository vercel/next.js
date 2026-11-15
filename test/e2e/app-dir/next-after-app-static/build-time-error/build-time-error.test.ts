/* eslint-env jest */
import { isNextDev, nextTestSetup } from 'e2e-utils'

// Static prerendering errors are only reported during production builds.
const _describe = isNextDev ? describe.skip : describe

_describe('after() in static pages - thrown errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('fails the build if an error is thrown inside after', async () => {
    await expect(next.start()).rejects.toThrow()

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
  }, 240_000)
})
