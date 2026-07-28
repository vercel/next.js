import { nextTestSetup } from 'e2e-utils'
import { getRedboxSource, waitForRedbox } from 'next-test-utils'

describe('browserOnly in a Server Component', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    it('shows a redbox for named imports in a Server Component', async () => {
      await next.start()

      const browser = await next.browser('/')
      await waitForRedbox(browser)
      const source = await getRedboxSource(browser)
      expect(source).toContain(
        "You're importing a module that depends on `browserOnly` into a React Server Component module."
      )
      expect(source).toContain(
        'This API is only available in Client Components.'
      )
    })
  } else {
    it('fails the build for named imports in a Server Component', async () => {
      const result = await next.build()

      expect(result.exitCode).toBe(1)
      expect(result.cliOutput).toContain(
        "You're importing a module that depends on `browserOnly` into a React Server Component module."
      )
      expect(result.cliOutput).toContain(
        'This API is only available in Client Components.'
      )
    })
  }
})
