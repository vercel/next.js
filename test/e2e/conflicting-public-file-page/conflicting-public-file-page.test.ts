import { nextTestSetup, isNextDev } from 'e2e-utils'

describe('Errors on conflict between public file and page file', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

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

  if (!isNextDev) {
    it('should show conflict error during build', async () => {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      const conflicts = ['/another/conflict', '/another', '/hello']

      expect(cliOutput).toMatch(/Conflicting public and page files were found/)

      for (const conflict of conflicts) {
        expect(cliOutput.indexOf(conflict) > 0).toBe(true)
      }
    }, 240_000)
  }
})
