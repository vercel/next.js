import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('duplicate-root-layouts', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  it('should show an error when encountering duplicate root layouts', async () => {
    if (isNextDev) {
      await next.start()

      if (!process.env.TURBOPACK) {
        // Webpack won't encounter the error until the page is navigated to, whereas Turbopack will encounter the error immediately
        await next.browser('/photos/1')
      }

      await retry(() => {
        expect(next.cliOutput).toContain(
          `You cannot have two layouts that correspond with the same path.`
        )
      })

      if (next) {
        await next.destroy()
      }
    } else {
      let error

      await next.start().catch((err) => {
        error = err
      })

      expect(error).toBeDefined()
      expect(next.cliOutput).toContain(
        `You cannot have two layouts that correspond with the same path.`
      )
    }
  })
})
