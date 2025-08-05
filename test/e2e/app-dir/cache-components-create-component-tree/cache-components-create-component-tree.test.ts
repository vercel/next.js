import { isNextDev, nextTestSetup } from 'e2e-utils'
import { assertNoRedbox } from 'next-test-utils'

describe('hello-world', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
    skipDeployment: true,
  })

  if (isNextDev) {
    it('should not indicate there is an error when incidental math.random calls occur during component tree generation during dev', async () => {
      const browser = await next.browser('/')
      await assertNoRedbox(browser)

      // The redbox assertion is currently unreliable in this test and so this is an additional check to ensure the CLI didn't print anything with `Math.random()` in it.
      expect(next.cliOutput).not.toContain('Math.random()')
    })
  } else {
    it('should not indicate there is an error when incidental math.random calls occur during component tree generation during build', async () => {
      try {
        await next.build()
      } catch (e) {
        console.error('Expected build to Succeed, but it failed.')
        throw e
      }

      expect(next.cliOutput).not.toContain('Math.random()')
    })
  }
})
