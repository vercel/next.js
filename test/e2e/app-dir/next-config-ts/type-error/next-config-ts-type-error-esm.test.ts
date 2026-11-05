import { gate } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-type-error-esm', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    packageJson: {
      type: 'module',
    },
  })

  it('should throw with type error on build (ESM)', async () => {
    if (await gate((c) => c.futureCompat)) {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain("code: 'DEP0144'")
      expect(cliOutput).toContain('at requireFromString')
      return
    }

    if (isNextDev) {
      await next.start()
      const $ = await next.render$('/')
      expect($('p').text()).toBe('foo')
    } else {
      await expect(next.start()).rejects.toThrow()
      const cliOutput = next.cliOutput
      expect(cliOutput).toContain(
        `Type 'string' is not assignable to type 'number'.`
      )
    }
  }, 240_000)
})
