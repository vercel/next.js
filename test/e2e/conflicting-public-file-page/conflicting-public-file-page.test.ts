import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'

describe('Errors on conflict between public file and page file', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  if (isNextDev) {
    it('should show conflict error during development', async () => {
      await next.start()

      const regex = /A conflicting public file and page file was found for path/

      const conflicts = ['/another/conflict', '/hello']
      for (const conflict of conflicts) {
        const html = await next.render(conflict)
        expect(html).toMatch(regex)
      }

      expect(next.cliOutput).toMatch(regex)
    })
  }

  if (isNextStart) {
    it('should show conflict error during build', async () => {
      const { cliOutput } = await next.build()
      const conflicts = ['/another/conflict', '/another', '/hello']

      expect(cliOutput).toMatch(/Conflicting public and page files were found/)

      for (const conflict of conflicts) {
        expect(cliOutput.indexOf(conflict) > 0).toBe(true)
      }
    })
  }
})
