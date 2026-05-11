import { nextTestSetup } from 'e2e-utils'

describe('jsconfig.json', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should build normally', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })

  it('should fail on invalid jsconfig.json', async () => {
    const originalJsconfig = await next.readFile('jsconfig.json')
    try {
      await next.patchFile('jsconfig.json', '{')
      const { exitCode } = await next.build()
      expect(exitCode).not.toBe(0)
      if (isTurbopack) {
        expect(next.cliOutput).toMatch(/An issue occurred while parsing/)
        expect(next.cliOutput).toMatch(/jsconfig.json:1:1/)
        expect(next.cliOutput).toMatch(
          /tsconfig is not parseable: invalid JSON: Unterminated object/
        )
      } else {
        expect(next.cliOutput).toMatch(/Error: Failed to parse "/)
        expect(next.cliOutput).toMatch(/JSON5: invalid end of input at 1:2/)
      }
    } finally {
      await next.patchFile('jsconfig.json', originalJsconfig)
    }
  })
})
